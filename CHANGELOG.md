# Changelog

## 0.1.0 - initial release

First public release of the AI Assistant connector for the Merchant Center, as an unsupported
commercetools Labs project.

- A commercetools Connect connector with a `service` application and three Merchant Center applications (the chat application, the pages application and the Custom View).
- Derived from an earlier multitenant system: this release serves exactly one commercetools project per installation and drops the multi-tenancy of its predecessor.
- All state is stored as commercetools Custom Objects; the previous document database is no longer used.
- Gemini models run on Vertex AI with one Base64 service-account key that also serves BigQuery and Cloud Storage; generated images stay in a private bucket and are streamed by the service.
- Administrators are the users listed in the Connect configuration `ADMIN_USER_IDS`; the former e-mail allowlist and Merchant Center permission scheme are gone.
- Third-party tool source credentials (Contentstack, Algolia, Stripe) are Connect configuration only.
- Deployment is done with the Connect CLI through `scripts/connect/connect.mjs`; there is no CI configuration.
