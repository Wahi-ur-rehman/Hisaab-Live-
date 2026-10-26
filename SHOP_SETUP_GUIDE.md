# 🏪 HisaabLive — Complete Shop Setup & POS Agent Deployment Guide

This guide provides end-to-end instructions for deploying **HisaabLive** at retail stores, supermarkets, pharmacies, and commercial outlets.

---

## 📑 Table of Contents
1. [Architecture Overview](#-architecture-overview)
2. [Prerequisites](#-prerequisites)
3. [Step 1: Create Shop in Super Admin Portal](#step-1-create-shop-in-super-admin-portal)
4. [Step 2: Install POS Agent on the Cash Register (Windows)](#step-2-install-pos-agent-on-the-cash-register-windows)
5. [Step 3: Connect POS Database](#step-3-connect-pos-database)
6. [Step 4: Shop Owner Mobile App Access](#step-4-shop-owner-mobile-app-access)
7. [🛡️ Tamper Protection & Fraud Detection](#️-tamper-protection--fraud-detection)
8. [🔧 Troubleshooting & Maintenance](#-troubleshooting--maintenance)

---

## 🏛 Architecture Overview

```
[ Shop Cashier / POS PC ]
      │ (Local Database: SQLite, SQL Server, Excel, Access, CSV)
      ▼
[ HisaabLiveAgent.exe ] (Read-only background service in C:\Program Files\HisaabLive)
      │
      │ Encrypted HTTPS Sync (Zero Firebase keys on shop PC)
      ▼
[ Google Cloud Firestore / Cloud Functions ] (Multi-tenant ledger)
      │
      ├──────────────────────────────┐
      ▼                              ▼
[ Owner Mobile App (Android/PWA) ]  [ Super Admin Console ]
• Live Daily Sales & Totals        • License & Expiry Management
• Khata / Udhaar Management        • Tenant Monitoring & Billing
• Anti-Fraud Alerts & Ledgers      • Security & Audit Telemetry
• Monthly PDF Statements
```

---

## 📋 Prerequisites

### On the Shop PC (Cash Register):
* **OS:** Windows 10 or Windows 11 (64-bit).
* **Permissions:** Administrator access on the PC for initial 1-minute installation.
* **Network:** Active internet connection (broadband or Wi-Fi hotspot).
* **POS Software:** Any Point-of-Sale billing software using:
  * SQLite (`.db`, `.sqlite`)
  * Microsoft SQL Server (`Express`, `Standard`, `Enterprise`)
  * Microsoft Access (`.accdb`, `.mdb`)
  * Excel spreadsheets (`.xlsx`)
  * CSV export files (`.csv`)

### Files Needed:
* **`HisaabLiveAgent.exe`** (Download from your GitHub Releases or GitHub Actions artifacts).
* **`HisaabLive.apk`** (For the shop owner's Android phone).

---

## Step 1: Create Shop in Super Admin Portal

1. Log into your Super Admin Portal at **`https://admin.yourdomain.com`** (or `http://localhost:4174` during setup).
2. Click **"+ Register New Shop"**.
3. Fill in the shop details:
   * **Shop Code:** Unique identifier (e.g., `G10`, `ISB01`, `KHI04`).
   * **Shop Name:** Commercial name (e.g., *Al-Madina General Store*).
   * **Owner Phone:** WhatsApp/SMS contact (e.g., `0300-1234567`).
   * **6-Digit Owner PIN:** Secret PIN chosen for the owner (e.g., `559922`).
   * **Monthly Fee (PKR):** Subscription price (e.g., `3500`).
4. Click **"Register Shop"**.
5. In the newly created shop row, click **"Generate Setup Code"**.
   * Note the generated 8-character code (e.g., `HL8A-29KJ`). This code is valid for 48 hours and links the shop PC to the database.

---

## Step 2: Install POS Agent on the Cash Register (Windows)

1. Copy **`HisaabLiveAgent.exe`** onto the shop’s POS computer (via USB drive or download).
2. Click the Windows Start menu, type **`cmd`**, right-click **Command Prompt**, and select **"Run as Administrator"**.
3. Navigate to the folder containing the downloaded `.exe`:
   ```cmd
   cd C:\Users\Shopkeeper\Downloads
   ```
4. Run the installation command:
   ```cmd
   HisaabLiveAgent.exe --install-startup
   ```
5. When prompted:
   ```text
   Enter Setup Code from Super Admin: HL8A-29KJ
   ```
   Paste the 8-character code and press **Enter**.

---

## Step 3: Connect POS Database

The agent will prompt you to select the POS database type:

```text
Where does your billing / POS program keep its data?
  1) SQLite database file (.db, .sqlite)
  2) SQL Server
  3) Microsoft Access file (.mdb, .accdb)
  4) Excel file (.xlsx)
  5) CSV file (Excel 'Save as CSV')
Number: 
```

### Option A: SQLite (Most common modern POS)
* Type `1` and enter the full path to the POS database:
  ```text
  Full path: C:\POS_Software\data\pos.db
  ```
* The agent automatically reads the schema and auto-maps columns:
  * `Invoice / Bill Number`
  * `Bill Total`
  * `Date & Time`
  * `Cashier / User`
* Press **Enter** to accept the automatic mapping.

### Option B: Microsoft SQL Server
* Type `2` and enter the server details:
  * **Server name:** `.\SQLEXPRESS` or `localhost`
  * **Database name:** `RetailPOS`
  * **SQL login:** Enter a read-only SQL user (e.g. `pos_reader`), or leave empty for Windows Authentication.

### Completing Installation:
The agent automatically:
1. Secures itself inside `C:\Program Files\HisaabLive\HisaabLiveAgent.exe`.
2. Sets folder permissions so only Windows `SYSTEM` and `Administrators` can access the config and license key.
3. Registers a silent boot task via Windows Task Scheduler (`schtasks`).
4. Starts syncing in the background immediately.

> **Tip:** You can now safely close the Command Prompt window and delete the downloaded `.exe` from Downloads or USB.

---

## Step 4: Shop Owner Mobile App Access

1. On the owner's Android smartphone, install **`HisaabLive.apk`** (or open the web app in mobile browser).
2. Select language (**Urdu** or **English**).
3. Enter:
   * **Shop Code:** (e.g., `G10`)
   * **6-Digit PIN:** (The secret PIN configured in Step 1)
4. The dashboard opens instantly, showing:
   * 🟢 **Live Today's Sale:** Updates in real-time as cashier rings bills.
   * 📊 **Monthly Gross & Net Profit:** Automatic deductions of recorded expenses.
   * 📒 **Digital Khata (Customer Udhaar):** Track receivables and customer payments.
   * 🧾 **Monthly PDF Statements:** Export official statements with 1-tap download.
   * 🛡️ **Anti-Tamper Alerts:** Immediate alert if any bill is deleted or discounted.

---

## 🛡️ Tamper Protection & Fraud Detection

HisaabLive includes cryptographic anti-tamper mechanisms to prevent insider cashier theft:

| Fraud Pattern | What Cashier Attempts | How HisaabLive Catches It |
|---|---|---|
| **Bill Deletion** | Cashier deletes bill after customer leaves and pockets cash. | Agent compares daily ledger against permanent cloud records; flags missing bill and exact deleted amount. |
| **Total Lowering** | Cashier edits a Rs. 5,000 bill to Rs. 3,000 and takes Rs. 2,000. | Cloud ledger stores first recorded version; alerts owner with original vs altered price difference. |
| **Retroactive Edits** | Editing yesterday's or last week's sales figures. | Agent continuously audits last 35 days every 15 minutes; flags retroactive modifications immediately. |
| **Off-Hours Activity** | Ringing or modifying bills at odd hours (00:00 - 05:00). | System triggers warning notification for irregular transaction hours. |
| **Agent Disconnection** | Cashier kills the background process or unplugs internet. | System flags "Silent Agent Alert" if no heartbeat received during operational hours (10:00 - 20:00). |

---

## 🔧 Troubleshooting & Maintenance

### 1. View Agent Status & Logs
On the shop PC, open Command Prompt as Administrator:
```cmd
type "C:\Program Files\HisaabLive\agent.log"
```

### 2. Changing Database Location (POS Upgraded / Path Changed)
If the shop moves their database file, reconfigure without reinstalling:
```cmd
cd "C:\Program Files\HisaabLive"
HisaabLiveAgent.exe --setup
```

### 3. Uninstalling from Shop PC
To completely remove the agent and delete stored license keys:
```cmd
cd "C:\Program Files\HisaabLive"
HisaabLiveAgent.exe --uninstall-startup
```

### 4. If Shop License is Leaked or Machine Replaced
1. Open Super Admin portal.
2. Click **"Revoke License"** on the shop row (invalidates old agent immediately).
3. Click **"Generate Setup Code"** and run `--install-startup` on the new machine.

### 5. Forgot Owner PIN
In Super Admin portal, click **"Reset PIN"**, enter a new 6-digit number, and inform the shop owner. (All active phone sessions are securely invalidated until the new PIN is entered).

---

*HisaabLive &copy; 2026. Engineered for reliability, financial accuracy, and loss prevention.*
