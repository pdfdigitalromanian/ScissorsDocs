# ScissorsDoc Python server

The frontend calls this FastAPI service through `/api`. During development,
Vite proxies that path to `http://127.0.0.1:8000`.

## Run locally

From the repository root:

```bash
npm run server:install
npm run server
```

Run the frontend in a second terminal:

```bash
npm run dev
```

Set `VITE_TOOLS_API_BASE_URL` when the API is hosted at a different origin.

## API

- `GET /api/health`
- `GET /api/tools`
- `POST /api/tools/{tool_id}` using multipart `files` and JSON-string `options`

Every tool has its own module in `scissors_server/tools`. Shared PDF, image,
security, conversion, optimization, and text processing code lives in
`scissors_server/services`.

## Optional system dependency

OCR uses `pytesseract` and requires the Tesseract executable to be installed on
the machine. Translation uses the configured online translation provider.
