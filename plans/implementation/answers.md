# Owner answers (non-publication questions)

- Q-impl-01: accept `client-credentials-as` when the authorization server metadata has a `registration_endpoint` (in addition to verdict `auth2`). Still to implement in change I; needs a live identity-mode server (M11) to verify.
- Q-impl-13: keep current Gemini model defaults; verify in the first live test with the Google key (M5).
- Q-impl-19: rehearsals use region gcp-us (us-central1.gcp) with a scratch sandbox project the owner creates; the private repo is this repo itself (origin commercetools/merchant-center-ai-assistant, branch develop). Whether connect-mu already has read access is unverified.
- Q-impl-33: owner expects the current limits (8 MiB feedback, 270 s chat) to fit Connect; measure on the first sandbox deploy (M22) and report if they do not.
