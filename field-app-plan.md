# Builder Ascent Field App: Implementation Plan

## 1. MVP Goal
Our primary objective is to get a functional, mobile-friendly tool into the hands of field crews immediately. This is not a native app yet. It is a streamlined mobile web experience designed to make form submission from the job site as frictionless as possible. The focus is purely on capturing critical daily data without the overhead of app store deployment or complex user management.

## 2. Core Features
The initial version must handle the essential daily paperwork:
* Fill out Pre-Task Safety Plan
* Fill out JHA (Job Hazard Analysis)
* Fill out Daily Foreman Log
* Fill out Time & Material Tracker
* Fill out Change Order Log
* Submit forms directly to the office
* Store all submissions in one centralized, accessible location

## 3. Free / Low-Cost First Version
Before investing in custom software development, we will validate the workflow using accessible tools:
* **Interface:** Mobile-optimized web pages hosted on the current Builder Ascent site.
* **Data Capture:** Google Forms embedded or linked directly from the mobile pages.
* **Data Storage:** Google Sheets functioning as the central database for all submitted forms.

## 4. Future App Features
Once the core workflow is proven and adopted by the field, we will expand into a more robust platform:
* User login and authentication
* Project-specific lists and data segregation
* Photo uploads directly from the field (for conditions, safety, or progress)
* Auto-emailing of completed forms to PMs or safety managers
* PDF generation for formal documentation and archiving
* Admin dashboard for office-side review and management
* Dedicated cloud storage integration

## 5. Recommended Build Phases
* **Phase 1:** Mobile web app prototype. Build the mobile-friendly landing pages linking out to forms.
* **Phase 2:** Google Forms/Sheets storage. Set up the form structures and the spreadsheet backend to capture data cleanly.
* **Phase 3:** Auto-email workflow. Implement basic automations to send alerts when critical forms are submitted.
* **Phase 4:** Real app or SaaS platform. Transition to a dedicated web app or native application once the process is standardized and requires advanced features.

## 6. Risks / Things to Avoid
* **Do not build a full native app too early:** We need to prove the field will actually use the digital forms before spending time and money on a native app.
* **Do not overcomplicate before testing:** Keep the initial version brutally simple. Complex features create friction, and friction means the field won't use it.
* **Keep forms fast and simple for field users:** Foremen are busy. If a form takes longer to fill out on a phone than on paper, the project fails. Minimize required typing; use dropdowns and checkboxes wherever possible.
