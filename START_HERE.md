# Start here — ReflectBlocks M1 + M2 + Enhanced M3

## 1. Keep your existing `.env`

```env
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
REFLECTBLOCKS_DATA_DIR=.data
COOKIE_SECURE=false
REFLECTBLOCKS_SESSION_SECRET=
```

No Google client secret is needed.

## 2. Backend

```powershell
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.venv\Scripts\python.exe -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

## 3. Frontend

Use Node 22.13+ (or a current LTS), then:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

## 4. Test the enhanced block model

Create a reflection, add multiple blocks, then drag a block's connector near another. A dashed preview should appear before it snaps into a semantic reflection thread.

Select a block to use the non-drag **Reflection threads** editor and to see locally suggested next questions.

## 5. Automated tests

```powershell
.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
```

Expected: **10 tests, OK**.

Read `MILESTONE_3_ENHANCED_GUIDE.md` for the full file map and database changes.
