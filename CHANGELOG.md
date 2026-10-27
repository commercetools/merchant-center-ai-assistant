# Changelog

## 0.1.0 - initial release

First public release of the AI Assistant connector for the Merchant Center, as an unsupported
commercetools Labs project.

- A commercetools Connect connector with a `service` application and three Merchant Center applications (the chat application, the pages application and the Custom View).
- A chat assistant that reads and changes commerce data through a commercetools Managed MCP server in identity mode, so every user acts with their own Merchant Center permissions.
- Optional tool sources: the commercetools Knowledge MCP, Contentstack, Algolia, Stripe, the embedded Nimbus design-system documentation, BigQuery for large results and image generation. Generated pages ("composed pages") are saved as Custom Objects and listed by the pages application.
- Each installation serves exactly one commercetools project.
- All state is stored as commercetools Custom Objects; the connector has no database of its own.
- Gemini models run on Vertex AI with one Base64 service-account key that also serves BigQuery and Cloud Storage; generated images stay in a private bucket and are streamed by the service.
- Administrators are the users listed in the Connect configuration `ADMIN_USER_IDS`; no Merchant Center permission grants administrator rights.
- Third-party tool source credentials (Contentstack, Algolia, Stripe) are Connect configuration only.
- Deployment is done with the Connect CLI through `scripts/connect/connect.mjs`; there is no CI configuration.
