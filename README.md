SlotRescue

A last-minute appointment recovery prototype for service businesses. SlotRescue helps a business keep track of appointment openings and organize a waitlist of clients who may be interested in filling them.

The project is an early-stage web app prototype. It currently provides a local dashboard and data-management workflows; it does not yet send real SMS or WhatsApp messages.

What it does

•
Create an account and manage a business profile.

•
Maintain a client waitlist with contact preferences, availability, preferred services, VIP status, and consent status.

•
Search and filter waitlist entries.

•
Maintain a catalog of services, durations, and prices.

•
Create, update, and track appointment openings, including their date, time, service, provider, price, and status.

•
View dashboard summaries and recent activity.


Messaging note: The app records whether a client prefers SMS or WhatsApp and tracks consent. A messaging provider has not been connected, so the app does not send messages yet.

Technology

•
Node.js and Express

•
SQLite using better-sqlite3

•
HTML, CSS, and browser-side JavaScript

•
Session-based authentication with password hashing

Requirements

Install 

Node.js (which includes npm) and 

Git before getting started.

Run locally

1.
Clone the repository and move into its folder:

Bash


git clone https://github.com/Wenzi98/SlotRescueApp.git
cd SlotRescueApp





2.
Install the dependencies:

Bash


npm ci





3.
Create a local environment file from the example.

Windows PowerShell:

Plain Text


Copy-Item .env.example .env



macOS / Linux / Git Bash:

Bash


cp .env.example .env





4.
Open .env and replace the example value with a long, private random value for SESSION_SECRET:

Plain Text


SESSION_SECRET=replace-this-with-your-own-long-random-secret



Keep .env private. It is ignored by Git and should not be committed or shared.



5.
Start the app:

Bash


npm start





6.
Open 
http://localhost:3000 in your browser. The terminal running the app must remain open. Stop the server with Ctrl+C.

The SQLite database and its tables are created automatically on first start. The local database file is stored under db/ and is ignored by Git.

Optional sample data

After creating your first account in the app, stop the server and run:

Bash


npm run seed



This adds sample services, waitlist clients, and appointment records to the local database. Restart the app with npm start afterward. You can skip this if you want an empty workspace.

Project structure

Plain Text


SlotRescueApp/
├── db/             SQLite database setup, session store, and seed script
├── middleware/     Request and authentication middleware
├── public/         Browser interface
├── routes/         Express API routes
├── .env.example    Example local environment configuration
├── package.json    Dependencies and npm scripts
└── server.js       Express server entry point



Available scripts

Command
Purpose
npm start
Start the local Express server on port 3000
npm run seed
Add sample records to the local SQLite database


