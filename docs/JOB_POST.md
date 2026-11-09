# Fluence — Full-Stack Developer (job post, as published)

Source: https://remotive.com/remote-jobs/software-development/full-stack-developer-2091165 (Remotive, posted 2026-10-29)

We’re looking for a pragmatic, security-minded Full-Stack Developer to help build and scale Fluence’s B2B products used by clinicians, researchers, and organizations in psychedelic-assisted therapy and mental health. You’ll work closely with and report to our Senior AI & Design Lead to turn product requirements into robust, secure, and well-documented applications, as well as maintain existing ones.
What you’ll do
Build and maintain full-stack web applications using React and Next.js .
Architect reliable, performant backends and APIs; familiarity with AWS (Lambda, ECS/Fargate, API Gateway, RDS/DynamoDB, S3, CloudFront, Cognito, etc.) is important. AWS Bedrock and AWS CloudTrail experience is a plus.
Implement secure authentication, authorization, and role-based access for clinician, admin, and other user workflows.
Design data models and flows with privacy, auditability, and regulatory considerations in mind.
Integrate with internal and external APIs and third-party services used in our B2B stack.
Experience with LLM/AI features in production (guardrails, logging, security considerations).
Implement logging, monitor performance, and ship production-quality code. Datadog and Sentry experience is a plus.
Collaborate directly with the Senior AI & Design Lead for clear ownership, feedback, and iteration.
Maintain clear documentation of architecture, decisions, and interfaces for internal teams.
(Bonus) Use Convex or similar BaaS / serverless data platforms for rapid product delivery.
(Bonus) Build and maintain n8n workflows (webhooks, scheduled jobs, error workflows, credential management, self-hosting) to automate internal operations and connect our product stack.
To confirm you’ve read this carefully, include the word “pineapple” somewhere in your email.
What we’re looking for
3+ years of experience as a full-stack or frontend-heavy engineer.
Strong proficiency in React , Next.js , TypeScript/JavaScript.
Hands-on experience with AWS for production workloads.
Solid understanding of web security best practices (OWASP, secure storage, encryption in transit/at rest, secrets management).
Experience building systems in or adjacent to healthcare, education, or compliance-heavy environments is a plus.
Excellent async communication, code ownership, and ability to work with a small, senior-led team.
Comfort working from a clear product brief and also proposing improvements proactively.
Familiarity with logging, monitoring, and observability tools.
Take-home assignment (Step 1 of the process)
Please complete a take-home assignment. You are allowed to use LLMs to write code. To ensure that your work will not be used at Fluence, we’ve made it unrelated to healthcare:
Build “LendLoop”: a neighborhood tool-lending board with automated workflows
A simple app where neighbors list tools they are willing to lend, request to borrow from each other, and receive automated notifications and reminders handled by n8n.
Stack
Next.js (App Router)
Clerk for authentication
Convex for data + backend logic
n8n (self-hosted via Docker or n8n Cloud) for workflow automation
TypeScript
Requirements
Public page
The fictional company name is LendLoop .
Short tagline, e.g. “Borrow what you need. Lend what you don’t.”
Show:
A read-only list of available tools (name and category only, no owner details), pulled from Convex.
A “Sign in to lend or borrow” button wired to Clerk.
Authenticated experience
Only signed-in users can:
List a tool with:
name
category (power tools, garden, kitchen, camping, etc.)
condition
short description
Request to borrow a tool for a date range.
Approve or decline requests on their own tools.
Mark a loan as returned.
Show:
All tools with availability status, filterable by category.
“My listings”, “My requests”, and “Incoming requests” views.
Nice, minimal layout.
Roles & rules
Have two roles:
admin :
Can remove any listing, view all loans, and mark a lender as “Trusted Lender”.
user :
Can create, edit, and delete only their own listings, and act only on requests involving their own tools or their own borrowing.
Implement the above role-based access control with best practices, enforced in Convex functions, not only in the UI.
Automation with n8n
Build at least two n8n workflows:
Request notification: when a borrow request is created or changes status, Convex calls an n8n Webhook. The workflow notifies the relevant user (email, Slack, Discord, or a logged mock notification is fine) using only the fields it needs.
Overdue reminders: a scheduled workflow runs daily, fetches overdue loans from a Convex HTTP endpoint, sends a reminder to each borrower, and writes the reminder status back to Convex.
Secure the integration in both directions:
Sign webhook payloads (e.g. HMAC with a shared secret) and verify signatures on the receiving side.
Keep secrets in environment variables and n8n credentials, never in code or exported workflow JSON.
Make write-backs idempotent so retries do not create duplicate records or reminders.
Handle failures with retries and an error workflow (or equivalent) so failed runs are visible and never fail silently.
(Bonus) Show recent automation activity on each loan in the app, e.g. “Reminder sent 2 days ago”.
Deliverables
A GitHub repository with the app source code.
Exported n8n workflow JSON files in the repository.
A README covering local setup (including n8n, e.g. a docker-compose file), environment variables, architecture, and your security and data-minimization decisions.
A short note on what you would change to run this in production.
We evaluate:
Code structure and clarity
Security-minded thinking
UX and practicality
Integration design, reliability, and error handling (n8n)
Documentation and reasoning
Interview Process
Take-home assignment submission (as described above).
Technical & product interview (walkthrough of your solution, architecture, security mindset, collaboration style).
6-month contract offer for the right candidate, with strong potential for renewal as a recurring contract based on performance and ownership.
How to apply
Email your portfolio, GitHub repository, and as an optional bonus, 1-2 other relevant projects to techjobs@fluencetraining.com , along with a short note on a security/privacy consideration you implemented (or would implement) in a healthcare or similar context.
Fluence is proud to be an Equal Opportunity Employer. All employment decisions are based on business needs, job requirements and individual qualifications. We do not discriminate on the basis of race, color, ancestry, national origin, religion or religious creed, mental or physical disability, medical condition, genetic information, sex (including pregnancy, childbirth, and related medical conditions), sexual orientation, gender identity, gender expression, age, marital status, military or veteran status, citizenship, or other characteristics protected by state or federal law or local ordinance.
