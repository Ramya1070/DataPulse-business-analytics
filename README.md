# DataPulse Business Analytics

A beginner-friendly Node.js + Express sales dashboard that accepts CSV and Excel `.xlsx` uploads, validates data on the server, displays interactive analytics, and exports filtered records to CSV.

## Requirements

- Node.js 18 or newer
- Internet connection for the Chart.js CDN (charts only)

## Run locally

1. Open this folder in VS Code.
2. Open Terminal → New Terminal.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open `http://localhost:3000` in your browser. Do not open `public/index.html` directly and do not use Live Server for this backend version.

## Expected columns

The first worksheet in an Excel file, or the CSV header row, must contain these column names:

`OrderID, OrderDate, Product, Category, Region, Quantity, Sales`

- `OrderDate`: use `YYYY-MM-DD` where possible.
- `Quantity` and `Sales`: non-negative numbers.
- Maximum upload size: 10 MB.
- Only `.csv` and `.xlsx` extensions are accepted.

A template is available at `http://localhost:3000/api/template`.

## Important privacy and deployment notes

This is a learning starter, not a production-ready multi-customer service. Uploaded files are processed in server memory and are not deliberately saved to disk. The browser retains the processed rows for its current page session. There is no login, tenant separation, persistent database, rate limiting, or production security configuration. Before accepting real customer data or deploying publicly, add authentication, authorization, request/rate limits, HTTPS, privacy notices, access controls, monitoring, and tests. Avoid uploading confidential or personally identifying information while learning.

## Files

- `server.js`: backend upload validation, CSV/XLSX parsing, and CSV export endpoint.
- `public/index.html`: website layout.
- `public/style.css`: layout and responsive styling.
- `public/app.js`: upload requests, filters, KPIs, charts, insights, and download behavior.
- `sales.csv`: sample data.
