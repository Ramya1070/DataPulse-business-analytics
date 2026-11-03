const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1
    },
    fileFilter: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();

        if (![".csv", ".xlsx"].includes(extension)) {
            return callback(new Error("Upload a .csv or .xlsx file."));
        }

        callback(null, true);
    }
});

const REQUIRED_COLUMNS = [
    "OrderID",
    "OrderDate",
    "Product",
    "Category",
    "Region",
    "Quantity",
    "Sales"
];

// Convert different date formats into YYYY-MM-DD.
function normalizeDate(value) {

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    // Handle Excel date serial numbers.
    if (typeof value === "number" && Number.isFinite(value)) {

        const parsed = XLSX.SSF.parse_date_code(value);

        if (parsed) {
            return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
        }
    }

    const text = String(value ?? "").trim();

    // Handle YYYY-MM-DD.
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (isoMatch) {

        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);

        const date = new Date(Date.UTC(year, month - 1, day));

        if (
            date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day
        ) {
            return text;
        }
    }

    // Handle DD/MM/YYYY or MM/DD/YYYY.
    const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

    if (match) {

        const a = Number(match[1]);
        const b = Number(match[2]);
        const year = Number(match[3]);

        let day;
        let month;

        if (a > 12) {
            day = a;
            month = b;
        } else if (b > 12) {
            month = a;
            day = b;
        } else {
            // Ambiguous dates are interpreted as DD/MM/YYYY.
            day = a;
            month = b;
        }

        const date = new Date(Date.UTC(year, month - 1, day));

        if (
            date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day
        ) {
            return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
    }

    return null;
}


// Validate and clean uploaded sales records.
function normalizeRows(rawRows) {

    if (!rawRows.length) {
        throw new Error("The uploaded file contains no data rows.");
    }

    const firstRow = rawRows[0] || {};
    const headers = Object.keys(firstRow);

    const missing = REQUIRED_COLUMNS.filter(
        column => !headers.includes(column)
    );

    if (missing.length) {
        throw new Error(
            `Missing required columns: ${missing.join(", ")}. Use the DataPulse sales template.`
        );
    }

    const cleaned = [];

    rawRows.forEach((row, index) => {

        const lineNumber = index + 2;

        const orderId = String(row.OrderID ?? "").trim();
        const product = String(row.Product ?? "").trim();
        const category = String(row.Category ?? "").trim();
        const region = String(row.Region ?? "").trim();

        const orderDate = normalizeDate(row.OrderDate);

        const quantity = Number(row.Quantity);
        const sales = Number(row.Sales);

        if (!orderId || !product || !category || !region) {
            throw new Error(
                `Row ${lineNumber}: OrderID, Product, Category, and Region cannot be empty.`
            );
        }

        if (!orderDate) {
            throw new Error(
                `Row ${lineNumber}: OrderDate is invalid. Use YYYY-MM-DD or a valid spreadsheet date.`
            );
        }

        if (
            row.Quantity === "" ||
            row.Quantity === null ||
            !Number.isFinite(quantity) ||
            quantity < 0
        ) {
            throw new Error(
                `Row ${lineNumber}: Quantity must be a non-negative number.`
            );
        }

        if (
            row.Sales === "" ||
            row.Sales === null ||
            !Number.isFinite(sales) ||
            sales < 0
        ) {
            throw new Error(
                `Row ${lineNumber}: Sales must be a non-negative number.`
            );
        }

        cleaned.push({
            OrderID: orderId,
            OrderDate: orderDate,
            Product: product,
            Category: category,
            Region: region,
            Quantity: quantity,
            Sales: sales
        });

    });

    return cleaned;
}


// Read CSV and Excel files.
function parseUploadedFile(file) {

    const extension = path.extname(file.originalname).toLowerCase();

    if (extension === ".csv") {

        const text = file.buffer
            .toString("utf8")
            .replace(/^\uFEFF/, "");

        const workbook = XLSX.read(text, {
            type: "string",
            raw: true
        });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        if (!sheet) {
            throw new Error("No data was found in the CSV file.");
        }

        return XLSX.utils.sheet_to_json(sheet, {
            defval: "",
            raw: true
        });
    }

    const workbook = XLSX.read(file.buffer, {
        type: "buffer",
        cellDates: true
    });

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

    if (!firstSheet) {
        throw new Error("No worksheet was found in the Excel file.");
    }

    return XLSX.utils.sheet_to_json(firstSheet, {
        defval: "",
        raw: true
    });
}


// API: Upload and analyze sales data.
app.post("/api/upload", upload.single("salesFile"), (req, res) => {

    try {

        if (!req.file) {
            return res.status(400).json({
                error: "Choose a CSV or Excel (.xlsx) file first."
            });
        }

        const rawRows = parseUploadedFile(req.file);
        const rows = normalizeRows(rawRows);

        res.json({
            message: `Successfully processed ${rows.length} sales records.`,
            fileName: path.basename(req.file.originalname),
            rows
        });

    } catch (error) {

        res.status(400).json({
            error: error.message || "The uploaded file could not be processed."
        });

    }
});


// Escape CSV values.
function csvCell(value) {

    const text = String(value ?? "");

    return `"${text.replace(/"/g, '""')}"`;
}


// API: Export filtered sales data.
app.post("/api/export", (req, res) => {

    try {

        const rows = req.body && req.body.rows;

        if (!Array.isArray(rows) || rows.length > 100000) {
            return res.status(400).json({
                error: "Invalid export data."
            });
        }

        const columns = REQUIRED_COLUMNS;

        const csv = [
            columns.map(csvCell).join(","),
            ...rows.map(row =>
                columns.map(column => csvCell(row[column])).join(",")
            )
        ].join("\r\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");

        res.setHeader(
            "Content-Disposition",
            'attachment; filename="datapulse-filtered-sales.csv"'
        );

        res.send("\uFEFF" + csv);

    } catch (error) {

        res.status(500).json({
            error: "Could not create the CSV export."
        });

    }
});


// API: Download CSV template.
app.get("/api/template", (req, res) => {

    const csv = [
        REQUIRED_COLUMNS.join(","),
        "101,2026-01-05,Laptop,Electronics,South,2,100000"
    ].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");

    res.setHeader(
        "Content-Disposition",
        'attachment; filename="datapulse-sales-template.csv"'
    );

    res.send("\uFEFF" + csv);
});


// Handle upload and server errors.
app.use((error, req, res, next) => {

    if (
        error instanceof multer.MulterError &&
        error.code === "LIMIT_FILE_SIZE"
    ) {
        return res.status(400).json({
            error: "File is too large. Maximum size is 10 MB."
        });
    }

    if (error) {
        return res.status(400).json({
            error: error.message || "Request failed."
        });
    }

    next();
});


// Start DataPulse server.
app.listen(PORT, () => {

    console.log(`DataPulse is running at http://localhost:${PORT}`);

});