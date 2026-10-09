## ADDED Requirements

### Requirement: Upload of generated images
L SHALL implement change H's `ImageUploader` (`upload(bytes, mediaType, sessionId): Promise<string>`) and register it with `setImageUploader` so that H's `imageGeneration` source becomes enabled whenever Google Cloud is configured (the bucket name always resolves: `GCP_BUCKET_NAME`, else `<gcp project id>-ai-assistant-images`). The uploader SHALL accept an image only when its media type is `image/png`, `image/jpeg`, `image/webp` or `image/gif` (SVG and everything else are rejected) and its size is at most 10 MB, and SHALL store it as `images/{sessionId}/{timestamp}-{random8}.{ext}` with the content type and, in `private` mode, `Cache-Control: private, no-store` (`public, max-age=3600` in `public` mode). Objects SHALL never be made public per object, SHALL never be given an ACL and no signed URL SHALL ever be produced. The returned value SHALL be, in `private` mode (`IMAGE_URL_MODE`, default), the service-relative path `/files/{sessionId}/{timestamp}-{random8}.{ext}` and, in `public` mode, `https://storage.googleapis.com/{bucket}/{object}`. Upload failures SHALL be logged and SHALL yield an empty URL so the stream continues.

#### Scenario: SVG rejected
- **WHEN** a generated file has media type `image/svg+xml`
- **THEN** it is not uploaded and the part is dropped with a warning

#### Scenario: Too large
- **WHEN** an image is 12 MB
- **THEN** it is not uploaded and the log names the size

#### Scenario: Private mode returns a backend path
- **WHEN** an image is uploaded with the default configuration
- **THEN** the returned value starts with `/files/<sessionId>/`, contains no host and no `X-Goog-` query, and the object has no public ACL or IAM grant

### Requirement: Authenticated image endpoint
The service SHALL expose `GET /service/files/:sessionId/:fileName` (row 28 of the route table of change G), behind the verified Merchant Center session of change D, and SHALL stream the object `images/{sessionId}/{fileName}` from the private bucket. `:sessionId` MUST be a UUID and `:fileName` MUST match `^[0-9]{10,15}-[a-f0-9]{8}\.(png|jpg|webp|gif)$`, otherwise the answer is 404 and no storage call is made; no other path segment or query parameter is ever used to build the object name. Access SHALL be granted only to the owner of the session (`session.userId === req.user.userId`) or to an administrator (`req.user.isAdmin` from change D: the verified user id is in `ADMIN_USER_IDS`; used by the backoffice transcript view); in every other case, including an unknown session or object, the answer is 404 with the standard error envelope `{ "success": false, "error": "File not found" }`. A successful answer is 200 with the raw bytes (not enveloped), `Content-Type` derived from the file extension (never from user input), `Content-Length` when known, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` and `Cache-Control: private, no-store`. The body SHALL be streamed (not buffered) and the storage stream SHALL be destroyed when the client disconnects.

#### Scenario: Owner reads own image
- **WHEN** the owner of session S calls `GET /service/files/S/1700000000000-ab12cd34.png` for an existing image
- **THEN** the status is 200, `Content-Type` is `image/png`, `Cache-Control` is `private, no-store` and the body equals the stored bytes

#### Scenario: Other user
- **WHEN** another member requests the same path
- **THEN** the status is 404 `File not found` and the bucket is not read

#### Scenario: Administrator
- **WHEN** an administrator (`req.user.isAdmin === true`) requests a member's image
- **THEN** the status is 200

#### Scenario: Forged e-mail does not grant access
- **WHEN** a non-administrator member requests another member's image with an `x-admin-email` header, a `userEmail` query parameter and a `userLabel` body field naming an administrator
- **THEN** the status is 404 `File not found` and the bucket is not read

#### Scenario: No session token
- **WHEN** the route is called without a valid forward-to JWT
- **THEN** the status is 401 and the bucket is not read

#### Scenario: Traversal attempt
- **WHEN** the file name is `..%2F..%2Fother.png` or `a.svg`
- **THEN** the status is 404 and no storage call is made

#### Scenario: Direct bucket URL is not public
- **WHEN** an unauthenticated client requests `https://storage.googleapis.com/<bucket>/images/<sessionId>/<file>` in `private` mode
- **THEN** Google answers 403 (or 401)

### Requirement: Public mode is an explicit opt-in
With `IMAGE_URL_MODE=public` the bucket SHALL be a uniform-bucket-level-access bucket that grants `allUsers` the role `roles/storage.objectViewer` at bucket level (when the service creates the bucket it applies this binding and does not enable public access prevention; for a pre-created bucket the self-check reports the exact command when anonymous reads fail) and the stored URL SHALL be the public bucket URL. The documentation SHALL state that this makes every generated image world-readable and that `private` is the default. Per-object ACLs SHALL NOT be used in any mode.

#### Scenario: Public upload
- **WHEN** an image is uploaded with `IMAGE_URL_MODE=public`
- **THEN** the returned URL is `https://storage.googleapis.com/<bucket>/images/<sessionId>/<file>` and an anonymous `GET` returns 200

#### Scenario: Public mode on a locked-down bucket
- **WHEN** the bucket enforces public access prevention and the mode is `public`
- **THEN** the upload still succeeds, the self-check logs once a configuration hint naming the bucket setting to change, and the stored URL is still the public URL form

### Requirement: Idempotent bucket bootstrap
When an object write answers `NoSuchBucket`, the service SHALL create the bucket once per process with `GCP_BUCKET_LOCATION` (default `us-central1`), uniform bucket-level access, and public access prevention `enforced` in `private` mode, and SHALL treat "already exists" as success. If the service account may not create buckets the failure SHALL be remembered and the upload SHALL fail with a logged, actionable message (the missing permission `storage.buckets.create`, the alternative of pre-creating the bucket with the exact `gcloud` command, and the roles `roles/storage.admin` on the project or `roles/storage.objectAdmin` on the pre-created bucket). An existing bucket's configuration SHALL never be modified.

#### Scenario: Bucket missing and permitted
- **WHEN** the first image is uploaded and the bucket does not exist and the SA holds `roles/storage.admin`
- **THEN** the bucket `<project>-ai-assistant-images` is created in `us-central1` with uniform access and public access prevention, and the upload succeeds

#### Scenario: Bucket missing and not permitted
- **WHEN** the bucket does not exist and the SA only has object permissions
- **THEN** the upload yields an empty URL, one error line names `storage.buckets.create` and gives the pre-creation command, and no retry storm follows

#### Scenario: Two parallel first uploads
- **WHEN** two uploads race on a missing bucket
- **THEN** exactly one create call is made and both succeed

### Requirement: Images fed back to the model
When history is sent to a model (the image model and the orchestrator), `ImageUploader.toModelMessages` SHALL convert every file part whose URL is a stored image (a `/files/{sessionId}/{fileName}` path, or a URL of the configured bucket in `public` mode) by reading the object through the Storage API (never an HTTP fetch), downscaling it to at most 200 px width, and passing it as base64 data; failures SHALL drop the part with an error log. A service-relative URL SHALL never reach the model provider.

#### Scenario: Follow-up edit
- **WHEN** the user asks to "make the logo bigger" after an image was generated
- **THEN** the model request contains the earlier image as data and no network fetch of any URL is made

### Requirement: Self-check reports and bootstraps Google resources
`checkGcpAnalytics()` (called by change U's `postDeploy`) SHALL return `{ bigquery, storage, visibility }` each `'ok'` or a reason from a closed list, never throw and never log raw Google error text. It SHALL create the BigQuery dataset (`GCP_BIGQUERY_DATASET_ID` in `GCP_BIGQUERY_LOCATION`) and the bucket idempotently when they are missing and the service account may; prove it can create and drop a probe table and write and delete a probe object `images/_selfcheck/<random>.png`; and, with an anonymous `HEAD` on that probe object, report `visibility` as `ok` only when the object is not readable in `private` mode (or is readable in `public` mode), otherwise with the exact fix. A missing resource that it may not create SHALL produce a reason naming the IAM role or the manual creation step.

#### Scenario: Fresh project with broad roles
- **WHEN** neither dataset nor bucket exist and the SA holds project-level `bigquery.dataEditor`, `bigquery.jobUser` and `storage.admin`
- **THEN** both are created and all three results are `ok`

#### Scenario: Least-privilege roles and a pre-created bucket
- **WHEN** the bucket exists, the SA has `storage.objectAdmin` on it, and the dataset is missing but the SA has project `bigquery.dataEditor`
- **THEN** the dataset is created, the bucket probe passes without `buckets.get`, and all results are `ok`

#### Scenario: Private bucket that is actually public
- **WHEN** `IMAGE_URL_MODE=private` and the anonymous `HEAD` of the probe object returns 200
- **THEN** `visibility` is a failure reason naming the bucket-level `allUsers` binding to remove
