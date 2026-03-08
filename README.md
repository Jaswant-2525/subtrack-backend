# SubTrack Backend ⚙️✉️

The automated Node.js backend engine for **SubTrack**, a full-stack subscription management application. 

This service acts as the "brain" of the application, running continuously in the background to monitor users' active subscriptions in Firebase Firestore. It calculates timezone-accurate billing dates and automatically sends HTML email reminders 3 days before a user is charged, ensuring they never miss a cancellation window.

## ✨ Features
* **Automated Cron Jobs:** Utilizes `node-cron` to execute a daily database sweep at 08:00 AM UTC.
* **Timezone-Aware Math:** Correctly queries Firestore Timestamps using a calculated Start-of-Day and End-of-Day range to catch subscriptions regardless of the user's local timezone (e.g., IST/UTC+5:30).
* **Automated Email Alerts:** Integrates with Nodemailer to securely send styled HTML email reminders via Gmail SMTP.
* **Auto-Renewal Logic:** Automatically calculates and advances the `nextBillingDate` in Firestore (by 1 month or 1 year based on the cycle) after sending the reminder.
* **Secure Admin Access:** Uses the Firebase Admin SDK to bypass frontend security rules and securely process all users' data.

## 🛠️ Tech Stack
* **Runtime:** Node.js
* **Server:** Express.js (used for a lightweight `/health` check route)
* **Database BaaS:** Firebase Admin SDK (Firestore)
* **Task Scheduling:** `node-cron`
* **Email Service:** Nodemailer
* **Environment Management:** `dotenv`

## 🚀 Local Setup & Installation

**1. Clone the repository**
\`\`\`bash
git clone https://github.com/your-username/subtrack-backend.git
cd subtrack-backend
\`\`\`

**2. Install dependencies**
\`\`\`bash
npm install
\`\`\`

**3. Set up Firebase Service Account**
* Go to the Firebase Console -> Project Settings -> Service Accounts.
* Generate a new Private Key (`.json` file).
* Create a folder named `config` in the root of this repository.
* Move the downloaded file into the `config` folder and rename it to `serviceAccountKey.json`.
* *(Note: This file is included in `.gitignore` and must never be pushed to GitHub).*

**4. Configure Environment Variables**
Create a `.env` file in the root directory and add the following keys:

\`\`\`env
PORT=3001
NODE_ENV=development

# Firebase Configuration (Local Development)
FIREBASE_SERVICE_ACCOUNT_PATH=./config/serviceAccountKey.json

# Email/SMTP Configuration (Use a Google App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASS=your16letterapppassword
EMAIL_FROM="SubTrack <your.email@gmail.com>"
\`\`\`

**5. Start the server**
\`\`\`bash
npm start
\`\`\`
The terminal will confirm the server is running and the cron job is registered.

## ☁️ Deployment
This service is designed to be hosted on platforms like **Render** or **Railway** as a continuously running Background Worker or Web Service. 

**Production Environment Variables Note:**
When deploying to the cloud, do not upload the `serviceAccountKey.json` file. Instead, parse the entire contents of the JSON file into a single environment variable string:
`FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account", ... }`

## 👤 Author
**Jaswant**
