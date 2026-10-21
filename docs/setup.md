# Setup outside commercetools

Everything the connector needs that does not live in commercetools: a Google Cloud project for Gemini, a service account, optional BigQuery and Cloud Storage resources, a git repository Connect can read, a few local tools and, optionally, third-party accounts.
Do this once, before the [first deployment](./connect-deployment.md). The commercetools side (an API client for the Connect CLI, the Merchant Center registrations) is in [connect-deployment.md](./connect-deployment.md).

The keys and defaults are listed in [configuration.md](./configuration.md); this page is the how-to.

## Checklist

| What | Needed for | Where the result goes |
| --- | --- | --- |
| Google Cloud project with billing and three APIs enabled | Gemini, BigQuery, image storage | `GCP_PROJECT_ID` (optional) |
| Gemini models you may call, in one Vertex AI location | Chat, digests, suggestions, images | `GCP_VERTEX_LOCATION`, `GEMINI_*_NAME` |
| Service account with four roles and a JSON key | Every Google call | `GCP_SA_KEY_BASE64` (secured) |
| BigQuery dataset (optional to pre-create) | Large tool results | `GCP_BIGQUERY_DATASET_ID`, `GCP_BIGQUERY_LOCATION` |
| Cloud Storage bucket (optional to pre-create) | Generated images | `GCP_BUCKET_NAME`, `GCP_BUCKET_LOCATION`, `IMAGE_URL_MODE` |
| Encryption key | Stored Managed MCP tokens | `ENCRYPTION_KEY` (secured) |
| Git repository with a release tag | Connect builds from it | `REPO_URL`, `REPO_TAG` |
| Node.js 22, Yarn 1, Docker, the Connect CLI | Build, validate, deploy | your workstation |
| Contentstack, Algolia or Stripe credentials (optional) | The matching tool sources | secured configuration |

## 1. Google Cloud project

Use an existing project or create one, and enable billing: Vertex AI needs it, and BigQuery streaming inserts need it (without billing the service falls back to slower load jobs).

```
gcloud config set project PROJECT_ID
gcloud services enable aiplatform.googleapis.com bigquery.googleapis.com storage.googleapis.com
```

If you do not set `GCP_PROJECT_ID`, the service uses the `project_id` inside the service-account key, so the key's project is the project that is billed.

## 2. Gemini on Vertex AI

The service calls three Gemini models through Vertex AI. All of them are called in one location, `GCP_VERTEX_LOCATION`.

| Role | Key | Default | Used for |
| --- | --- | --- | --- |
| main | `GEMINI_MODEL_NAME` | `gemini-3.8-flash` | The chat, with a high thinking level, and the Algolia, Stripe, export and Contentstack agents |
| lite | `GEMINI_LITE_MODEL_NAME` | `gemini-3.5-flash-lite` | Session digests, suggestions, the result analyzer (thinking level `GEMINI_LITE_THINKING_LEVEL`, default `minimal`) |
| image | `GEMINI_IMAGE_MODEL_NAME` | `gemini-2.5-flash-image` | Image generation |

Before the first deployment, check that your project can call these models in the location you chose:

- The default location is `us-central1`. Not every model is served from every region, and a project may lack access to a model.
- The symptom is a chat that ends with `Publisher model ... was not found or your project does not have access to it`.
- The fix is one of: set `GCP_VERTEX_LOCATION=global` (the service accepts `global`, `us`, `eu` or a region), pick a location where the models are available, or set `GEMINI_MODEL_NAME` to a model your project can call.
- One location serves all three roles. If images fail after you change it, check that `GEMINI_IMAGE_MODEL_NAME` exists in the new location.
- After deployment, the `post-deploy: vertex` line of the service log reports whether the lite model answered in the configured location ([operations.md](./operations.md)).

## 3. Service account and key

One service account serves Vertex AI, BigQuery and Cloud Storage.

```
gcloud iam service-accounts create ai-assistant --display-name "AI Assistant"
SA=ai-assistant@PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding PROJECT_ID --member "serviceAccount:$SA" --role roles/aiplatform.user
gcloud projects add-iam-policy-binding PROJECT_ID --member "serviceAccount:$SA" --role roles/bigquery.jobUser
gcloud projects add-iam-policy-binding PROJECT_ID --member "serviceAccount:$SA" --role roles/bigquery.dataEditor
```

Storage needs one of two choices:

| Choice | Role | Effect |
| --- | --- | --- |
| Simple | `roles/storage.admin` on the project | The service creates the private image bucket on first use. Broad: it can also change bucket policies |
| Least privilege | `roles/storage.objectAdmin` on one bucket you create yourself ([step 5](#5-cloud-storage-bucket-optional)) | The service never creates or changes a bucket |

Create the key and turn it into the single-line Base64 value of `GCP_SA_KEY_BASE64`:

```
gcloud iam service-accounts keys create key.json --iam-account "$SA"
base64 < key.json | tr -d '\n'
```

- Put the output into `GCP_SA_KEY_BASE64`, then delete `key.json`. The key is secured configuration and is never logged.
- A key may be at most 16 KiB (a real one is about 3 KB). An invalid value is reported with a fixed reason such as `not valid base64` or `missing field "private_key"`, without echoing it.
- If your organization blocks key creation (the `iam.disableServiceAccountKeyCreation` policy), ask the administrator for an exception for this project. The service reads a key; it does not support other credentials.

## 4. BigQuery dataset (optional)

The service offloads very large tool results to BigQuery. It creates the dataset on first use when the account may. To create it yourself:

```
bq --location us-central1 mk --dataset PROJECT_ID:aiassistant
```

- The dataset id is `GCP_BIGQUERY_DATASET_ID` (default `aiassistant`) and its location is `GCP_BIGQUERY_LOCATION` (default `us-central1`). The location cannot be changed once the dataset exists.
- Missing or unreachable analytics only produce `post-deploy: gcp analytics:` warnings. Chat works without them.

## 5. Cloud Storage bucket (optional)

Generated images are stored in a private bucket named `GCP_BUCKET_NAME` (default `<project id>-ai-assistant-images`) in `GCP_BUCKET_LOCATION` (default `us-central1`, or a multi-region such as `US`).

To create it yourself and keep the least-privilege role:

```
gcloud storage buckets create gs://BUCKET_NAME --project PROJECT_ID --location us-central1 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding gs://BUCKET_NAME \
  --member "serviceAccount:$SA" --role roles/storage.objectAdmin
```

- `IMAGE_URL_MODE=private` (default) keeps the bucket private and streams images through the service to the session owner or an administrator. `public` stores the public bucket URL in the message; a bucket the service creates then gets a public read binding, while an existing bucket is never changed ([security.md](./security.md#generated-images)).
- Without a bucket the service drops a generated image and logs it. Chat continues.

## 6. Encryption key

```
openssl rand -base64 32
```

Put the output into `ENCRYPTION_KEY`. It encrypts the stored Managed MCP tokens. Keep a copy: changing it later makes stored tokens unreadable and every user has to connect again. Rotation is described in [configuration.md](./configuration.md#encryption-key).

## 7. Git repository

Connect builds the applications from your repository at a tag, so it must contain this code and be readable by Connect.

- Push the code and create a release tag, for example `v0.1.0`. `REPO_URL` and `REPO_TAG` take the clone URL and the tag.
- For a private GitHub repository, give the GitHub user `connect-mu` read access.
- Every code change that you want deployed needs a new tag ([update steps](./connect-deployment.md#updating-and-rolling-back)).

## 8. Local tools

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js | 22 | The service and the helper scripts (npm), the frontends (Yarn 1) |
| Yarn | 1 | The three Merchant Center applications |
| Docker | a running daemon | `commercetools connect validate` builds with Buildpacks |
| Connect CLI | `@commercetools/cli` 0.0.17 or newer | `npm install -g @commercetools/cli` |

## 9. Third-party providers (optional)

Each provider is configuration of the Connect deployment only; nothing is entered in the app. A provider is enabled when all of its required keys are set and valid, otherwise it is disabled with a warning in the log.

| Provider | Create | Keys |
| --- | --- | --- |
| Contentstack | A stack API key and a Management Token. Scope the token to what the assistant may change | `CONTENTSTACK_API_KEY` and `CONTENTSTACK_MANAGEMENT_TOKEN`; optional `CONTENTSTACK_REGION` (default `na`) and `CONTENTSTACK_BRANCH` |
| Algolia | The https URL of an Algolia MCP server. It is secured because it may embed a key; it must be a public https address | `ALGOLIA_MCP_URL` |
| Stripe | A restricted key (`rk_`) limited to the tools you want to allow; a `sk_` secret key also works | `STRIPE_SECRET_KEY`; optional `STRIPE_CONNECTED_ACCOUNT_ID` (`acct_...`) |

The assistant can call every tool a key allows, so prefer restricted keys. Details: [configuration.md](./configuration.md#third-party-providers).

## Where the values go

For a deployment, the helper reads them from `scripts/connect/.env.connect` (copy `.env.connect.example`; the file is git-ignored) and sends them as Connect configuration. For a local run they go into `service/.env.local` ([development.md](./development.md#run-the-service)).

| Value | `.env.connect` and Connect | `service/.env.local` |
| --- | --- | --- |
| Service-account key | `GCP_SA_KEY_BASE64` | `GCP_SA_KEY_BASE64` |
| Encryption key | `ENCRYPTION_KEY` | `ENCRYPTION_KEY` |
| Vertex AI location, models | `GCP_VERTEX_LOCATION`, `GEMINI_*_NAME` | the same names |
| BigQuery, bucket | `GCP_BIGQUERY_*`, `GCP_BUCKET_*`, `IMAGE_URL_MODE` | the same names |
| Provider keys | `CONTENTSTACK_*`, `ALGOLIA_MCP_URL`, `STRIPE_*` | the same names |
| Repository | `REPO_URL`, `REPO_TAG` | not used |

## Check the setup

After the first deployment, read the service log (`node scripts/connect/connect.mjs logs`) for the `post-deploy:` lines. `sa-key`, `vertex` and `probe` failures fail the deployment check and say why; the `gcp analytics` lines are warnings. The full list of symptoms is in [troubleshooting.md](./troubleshooting.md).
