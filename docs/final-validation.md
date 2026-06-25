# Final Validation

## Completed

- Floating chatbot widget is available as a standalone vanilla script at `/widget.js`.
- Widget can be embedded with `<script src="https://DOMAIN/widget.js"></script>`.
- Widget floats bottom-right, is mobile responsive, supports pharmacy branding, and accepts API endpoint configuration.
- Backend API is implemented with Node.js and Express.
- Frontend admin application is implemented with React and Vite.
- RAG knowledge base uses PostgreSQL and pgvector.
- Ollama is used for local embeddings and answer generation.
- Documents have `pending`, `approved`, `rejected`, and `archived` statuses.
- Approval metadata is stored: approved/rejected actor, timestamp, and rejection reason.
- Only approved documents are indexed and retrieved for answers.
- Uploaded PDFs and text documents are ingested for admin review.
- Approved medical URLs can be fetched, stored for review, approved, and indexed.
- Citations are required on every answer.
- Uncited model responses are refused.
- Questions without approved source coverage are refused clearly.
- Every refusal creates an audit log entry.
- Conversation and admin workflow audit logs are stored.
- Safety wording is displayed in the app and widget: "Clinical decision-support only. Not a replacement for professional judgement."
- Pilot metrics dashboard includes questions asked, refusals, most referenced documents, most searched medicines, active users, and daily usage.
- Shared Oracle Linux VM deployment uses `/var/www/sa-medassist`, port `4100`, PM2 process `sa-medassist-api`, database `sa_medassist`, and separate environment variables.
- Deployment files include `ecosystem.config.cjs`, `.env.example`, `deployment.md`, `setup-server.sh`, GitHub Actions workflow, and rollback procedure.
- README includes setup, workflow, widget, API, and deployment steps.
- Architecture remains simple for a pilot: one React app, one Express API, PostgreSQL/pgvector, Ollama, and PM2.

## Partially Completed

- URL source allowlisting recognises common authorities including SAHPRA, NDoH, NICD, HPCSA, and WHO. Admin override is supported for other approved medical URLs, but a production deployment should maintain a formal approved-domain register.
- Most searched medicines are reported from a starter medicine dictionary. A production deployment should expand this list or connect it to an approved medicine terminology source.
- GitHub Actions deploy workflow is implemented, but it requires repository secrets to be configured on GitHub before it can run.

## Remaining Work

- Configure production secrets: `ORACLE_VM_HOST`, `ORACLE_VM_USER`, `ORACLE_VM_SSH_KEY`, `ADMIN_TOKEN`, database password, and production domain.
- Install and verify Ollama models on the Oracle Linux VM.
- Configure Caddy by adding a separate SA MedAssist site file and importing it without overwriting TransitIQ.
- Run the migration and build on the target VM.
- Perform clinical/content review of approved source documents before pilot use.
