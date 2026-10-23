# 3 · Master data

| Id | Do | Expect | Result |
|---|---|---|---|
| 3.01 | Zones: add one | listed | |
| 3.02 | HQs: add an HQ under a zone (name only); rename it later | saved; its routes are re-named "new name to destination" | |
| 3.03 | Routes > New: choose the HQ, type a destination and a km | the Type shows "Automatic — Ex-station" etc. as you type the km; saves as "HQ to destination"; picking another type gives a **warning, not a block** | |
| 3.03a | Route: add the same destination twice under one HQ; edit a route's km and destination | the duplicate is refused; the name changes with the destination; an Automatic type moves with the km | |
| 3.04 | Route over `TA_MAX_KM` | paid TA capped at the maximum (K1) | |
| 3.05 | Route detail: assign an MR | shown under assignments | |
| 3.06 | Products: list shows XYZ-500 and 3 SAMPLE products with prices | PTS, PTR, MRP shown | |
| 3.07 | Distributors: add (Details, Coverage, Location, Review): pick a zone (or add one), tick two routes, add people of different designations | saved; the list shows the routes and the number of people; no Orders (primary/secondary) section anywhere | |
| 3.07a | Distributor: try routes from two zones (change the zone after choosing routes) | the routes are cleared when the zone changes; the server refuses mixed zones | |
| 3.07b | Chemists: add (Details, Location, Review) | same shell as employees and doctors | |
| 3.08 | Chemists: add, edit, open | saved | |
| 3.09 | Doctors: list, filter, open one | 36 sample doctors; assignments shown | |
| 3.10 | Doctors: add one (Details → Location → Review, like a new employee) | Next with empty fields shows errors only then; Location can be skipped; appears for the MR who covers its route only | |
| 3.10a | Doctor form: open the Speciality list and scroll to the last item | the list scrolls; every item can be reached (same for any dropdown) | |
| 3.10b | Doctor photo (optional): add one while adding a doctor; then on an existing doctor choose another, then Remove | Optional (skip it and the doctor is made); the Doctors table shows the photo, or initials when none; replacing/removing works; a PDF or a file over 5 MB is refused with a message | |
| 3.10c | An older doctor with no photo: open the list and its page | Shows initials; nothing else changes | |
| 3.10d | An MR (phone or API) sets the photo of a doctor they added, before and after Admin approves it | Allowed while waiting or sent back (and does not resubmit); `409` once approved; another MR's doctor is `404` | |
| 3.11 | Specialities, Doctor services, Doctor gifts: add / edit | listed | |
| 3.12 | Each list: empty state, search, paging | readable, no error | |
