"use strict";

const REQUIRED_COLUMNS = [
    "OrderID", "OrderDate", "Product", "Category",
    "Region", "Quantity", "Sales"
];

const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("sales-file");
const uploadButton = document.getElementById("upload-button");
const uploadMessage = document.getElementById("upload-message");
const loadSampleButton = document.getElementById("load-sample");
const regionFilter = document.getElementById("region-filter");
const startDateInput = document.getElementById("start-date");
const endDateInput = document.getElementById("end-date");
const applyButton = document.getElementById("apply-filter");
const resetButton = document.getElementById("reset-filters");
const dateError = document.getElementById("date-error");
const dashboardStatus = document.getElementById("dashboard-status");
const tableBody = document.getElementById("sales-table-body");
const downloadButton = document.getElementById("download-csv");

let salesData = [];
let filteredSales = [];
let productChart = null;
let monthlyChart = null;

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency", currency: "INR", maximumFractionDigits: 2
    }).format(amount);
}

function showUploadMessage(message, isError = false) {
    uploadMessage.textContent = message;
    uploadMessage.style.color = isError ? "#b91c1c" : "#475569";
}

function clearError() {
    dateError.textContent = "";
    dateError.hidden = true;
}

function showDateError(message) {
    dateError.textContent = message;
    dateError.hidden = false;
}

function validateDates() {
    clearError();
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    if (startDate && endDate && startDate > endDate) {
        showDateError("Invalid date range! Start Date must be earlier than or equal to End Date.");
        dashboardStatus.textContent = "Please correct the date range and try again.";
        return false;
    }
    return true;
}

async function uploadFile(file) {
    if (!file) {
        showUploadMessage("Choose a CSV or Excel (.xlsx) file first.", true);
        return;
    }

    const extension = file.name.toLowerCase().split(".").pop();
    if (!["csv", "xlsx"].includes(extension)) {
        showUploadMessage("Unsupported file type. Please choose .csv or .xlsx.", true);
        return;
    }

    const formData = new FormData();
    formData.append("salesFile", file);
    uploadButton.disabled = true;
    showUploadMessage("Uploading and validating your file...");

    try {
        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Upload failed.");
        }

        salesData = result.rows;
        startDateInput.value = "";
        endDateInput.value = "";
        regionFilter.value = "All";
        clearError();
        populateRegions();
        updateDashboard();
        showUploadMessage(`${result.message} File: ${result.fileName}`);
    } catch (error) {
        showUploadMessage(error.message || "Could not upload the file.", true);
    } finally {
        uploadButton.disabled = false;
    }
}

uploadForm.addEventListener("submit", event => {
    event.preventDefault();
    uploadFile(fileInput.files[0]);
});

loadSampleButton.addEventListener("click", async () => {
    try {
        showUploadMessage("Loading sample data...");
        const response = await fetch("/sales.csv");
        if (!response.ok) throw new Error("Could not load sales.csv.");
        const blob = await response.blob();
        const sampleFile = new File([blob], "sales.csv", { type: "text/csv" });
        await uploadFile(sampleFile);
    } catch (error) {
        showUploadMessage(error.message, true);
    }
});

function populateRegions() {
    const regions = [...new Set(salesData.map(row => row.Region))].sort();
    regionFilter.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "All";
    allOption.textContent = "All Regions";
    regionFilter.appendChild(allOption);

    regions.forEach(region => {
        const option = document.createElement("option");
        option.value = region;
        option.textContent = region;
        regionFilter.appendChild(option);
    });
    regionFilter.value = "All";
}

function updateDashboard() {
    if (!validateDates()) return;

    const region = regionFilter.value;
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    filteredSales = salesData.filter(row => {
        return (region === "All" || row.Region === region) &&
            (!startDate || row.OrderDate >= startDate) &&
            (!endDate || row.OrderDate <= endDate);
    });

    renderDashboard(filteredSales);

    let status = `Showing ${filteredSales.length} of ${salesData.length} sales records`;
    if (region !== "All") status += ` · Region: ${region}`;
    if (startDate || endDate) status += ` · Dates: ${startDate || "earliest"} to ${endDate || "latest"}`;
    dashboardStatus.textContent = status + ".";
    downloadButton.disabled = filteredSales.length === 0;
}

function renderDashboard(data) {
    updateKPIs(data);
    updateTable(data);
    updateProductChart(data);
    updateMonthlyChart(data);
    updateInsights(data);
}

function updateKPIs(data) {
    const revenue = data.reduce((sum, row) => sum + row.Sales, 0);
    const orders = data.length;
    const units = data.reduce((sum, row) => sum + row.Quantity, 0);

    document.getElementById("total-revenue").textContent = formatCurrency(revenue);
    document.getElementById("total-orders").textContent = orders.toLocaleString("en-IN");
    document.getElementById("total-units").textContent = units.toLocaleString("en-IN");
    document.getElementById("average-order-value").textContent =
        formatCurrency(orders ? revenue / orders : 0);
}

function formatDisplayDate(isoDate) {
    const [year, month, day] = isoDate.split("-");
    return `${day}-${month}-${year}`;
}

function updateTable(data) {
    tableBody.innerHTML = "";
    if (!data.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 7;
        cell.className = "empty-row";
        cell.textContent = salesData.length
            ? "No sales records match these filters."
            : "Upload a file to see records.";
        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }

    data.forEach(item => {
        const row = document.createElement("tr");
        const values = [
            item.OrderID, formatDisplayDate(item.OrderDate), item.Product,
            item.Category, item.Region, item.Quantity.toLocaleString("en-IN"),
            formatCurrency(item.Sales)
        ];
        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });
        tableBody.appendChild(row);
    });
}

function updateProductChart(data) {
    if (typeof Chart === "undefined") {
        console.error("Chart.js did not load. Check your internet connection.");
        return;
    }

    const totals = {};
    data.forEach(row => totals[row.Product] = (totals[row.Product] || 0) + row.Sales);

    if (productChart) productChart.destroy();
    productChart = new Chart(document.getElementById("product-chart"), {
        type: "bar",
        data: {
            labels: Object.keys(totals),
            datasets: [{
                label: "Revenue",
                data: Object.values(totals),
                backgroundColor: "#3b82f6",
                borderRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: context => formatCurrency(context.raw) } }
            },
            scales: {
                y: { beginAtZero: true, ticks: {
                    callback: value => "₹" + Number(value).toLocaleString("en-IN")
                }}
            }
        }
    });
}

function updateMonthlyChart(data) {
    if (typeof Chart === "undefined") return;

    const totals = {};
    data.forEach(row => {
        const month = row.OrderDate.slice(0, 7);
        totals[month] = (totals[month] || 0) + row.Sales;
    });

    const months = Object.keys(totals).sort();
    const labels = months.map(month => {
        const [year, monthNumber] = month.split("-");
        return new Date(Number(year), Number(monthNumber) - 1, 1)
            .toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    });

    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(document.getElementById("monthly-chart"), {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Monthly Revenue",
                data: months.map(month => totals[month]),
                borderColor: "#16a34a",
                backgroundColor: "rgba(22, 163, 74, 0.12)",
                fill: true, tension: 0.3, pointRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { tooltip: { callbacks: { label: context => formatCurrency(context.raw) } } },
            scales: {
                y: { beginAtZero: true, ticks: {
                    callback: value => "₹" + Number(value).toLocaleString("en-IN")
                }}
            }
        }
    });
}

function updateInsights(data) {
    const productElement = document.getElementById("top-product");
    const regionElement = document.getElementById("top-region");
    const monthElement = document.getElementById("top-month");

    if (!data.length) {
        productElement.textContent = "No data available";
        regionElement.textContent = "No data available";
        monthElement.textContent = "No data available";
        return;
    }

    const products = {};
    const regions = {};
    const months = {};

    data.forEach(row => {
        products[row.Product] = (products[row.Product] || 0) + row.Sales;
        regions[row.Region] = (regions[row.Region] || 0) + row.Sales;
        const month = row.OrderDate.slice(0, 7);
        months[month] = (months[month] || 0) + row.Sales;
    });

    const bestProduct = Object.entries(products).sort((a, b) => b[1] - a[1])[0];
    const bestRegion = Object.entries(regions).sort((a, b) => b[1] - a[1])[0];
    const bestMonth = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
    const [year, monthNumber] = bestMonth[0].split("-");
    const monthLabel = new Date(Number(year), Number(monthNumber) - 1, 1)
        .toLocaleDateString("en-IN", { month: "short", year: "numeric" });

    productElement.textContent = `${bestProduct[0]} (${formatCurrency(bestProduct[1])})`;
    regionElement.textContent = `${bestRegion[0]} (${formatCurrency(bestRegion[1])})`;
    monthElement.textContent = `${monthLabel} (${formatCurrency(bestMonth[1])})`;
}

regionFilter.addEventListener("change", updateDashboard);
applyButton.addEventListener("click", updateDashboard);
startDateInput.addEventListener("change", clearError);
endDateInput.addEventListener("change", clearError);

resetButton.addEventListener("click", () => {
    regionFilter.value = "All";
    startDateInput.value = "";
    endDateInput.value = "";
    clearError();
    updateDashboard();
});

downloadButton.addEventListener("click", async () => {
    if (!filteredSales.length) return;

    downloadButton.disabled = true;
    try {
        const response = await fetch("/api/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: filteredSales })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Export failed.");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "datapulse-filtered-sales.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        showUploadMessage(error.message || "Could not download CSV.", true);
    } finally {
        downloadButton.disabled = filteredSales.length === 0;
    }
});

// Start with an empty dashboard. User can upload their file or load sample data.
renderDashboard([]);
