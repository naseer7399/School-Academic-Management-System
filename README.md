# School Academic Manager (simple version)

Plain files + Firebase, like the Ikhlas School Manager: no install, no build. Upload the files and it runs.
Files: `index.html`, `style.css`, `app.js`, `firebase-config.js`, `firestore.rules`.

**Use a NEW Firebase project** (separate from the Ikhlas School Manager's). Never reuse its settings.

## Setup (about 15 minutes)
1. **Firebase console** > Add project. Then **Build > Firestore Database > Create database** (production mode).
2. **Build > Authentication > Get started > Email/Password > Enable**.
3. **Firestore > Rules**: replace everything with the contents of `firestore.rules`, click **Publish**.
4. **Project settings (gear) > Your apps > Web app (</>)**: copy the config into `firebase-config.js`.
5. **Create the first admin (one time):**
   - Authentication > Users > **Add user** (your email + password). Copy the **User UID**.
   - Firestore > Start collection `users` > Document ID = that UID, with fields:
     `name` (string), `email` (string), `role` = `admin` (string), `active` = true (boolean), `classIds` (array, empty), `childIds` (array, empty), `studentId` (string, empty).
6. **GitHub Pages:** upload the 4 app files to a new repository, Settings > Pages > Deploy from branch `main` / root.
7. Firebase > Authentication > Settings > **Authorized domains** > add `YOURNAME.github.io`.
8. Open the site and sign in as the admin.

## First-run test (use fictional data)
1. Classes: add `2` with subjects `English, Maths`. 2. Students: add two students in class 2.
3. Users: create a teacher (class 2) and a parent (admission numbers of one student). Test each by signing in (private window).
4. Teacher: mark attendance (one absent) > parent sees the notice. 5. Admin: create an exam, teacher enters marks and submits, admin publishes > parent sees results (and not before).
6. Teacher adds syllabus topics and marks one completed > parent sees the percentage.
7. Check the parent cannot see the other student: in Firebase's Rules Playground try reading another student's document as the parent.

## Roles
Admin: everything. Teacher: attendance, marks (drafts and submit), syllabus and notices for assigned classes. Parent/Student: read-only, own child only, published results only.

## Honest limits of this version
- **Rules are untested.** They were written without access to the Firebase emulator. Test them (step 7 above) before using real student data.
- Marks limits (0 to maximum) are checked in the app only, not by the database rules.
- Teachers are assigned to whole classes, not to individual subjects.
- Attendance corrections have no time window and no separate correction log; changes are not audit-logged yet.
- Notices are **in-app only**. Email, SMS and WhatsApp show "not configured"; real sending needs a provider and a server component.
- Reports are print-only (browser Print / Save as PDF). No CSV export, no report-card layout, no analytics charts yet.
- No student CSV import yet (the field mapping from the Ikhlas export is ready in `student_data_mapping.xlsx`).
- Syllabus has no change history. Parent portal login uses a real account, never admission number + date of birth.
- Back up regularly: Firestore export from the Google Cloud console, or ask for a backup button to be added.
