# Magnus Drive - Manager User Manual

Welcome to the **Magnus Drive** Inventory Management System. This manual is designed specifically for **Managers**, guiding you step-by-step through your daily operations, inventory control, and reporting. 

---

## 1. Getting Started & Navigation

### Logging In
Once you log in with your Manager credentials, you will land on the **Home** Dashboard. The application uses a unified sidebar on the left for navigation. 

### Selecting Your Godown
As a Manager, you have the ability to switch between different Godowns (e.g., `1 Vasai`, `2 Virar`) to view and manage data specific to that location.
1. Look at the top right of the top navigation bar.
2. Use the **Godown Dropdown** to switch your active location. 
3. *Note: All sales, purchases, and stock views will instantly update to reflect the selected Godown.*

### Cloud Sync
Your data syncs automatically, but you can manually force a sync to the cloud:
- Click the **Sync** button (☁️) in the top header.
- A notification will pop up confirming "Synced to cloud".

---

## 2. Master Data Management

Before recording transactions, you need to ensure your Products and Parties are set up.

### Products
Navigate to the **Products** tab to manage your catalog.
- **Add a Product:** Fill in the Product Code and Category in the top bar, then click **Add Product**.
- **Edit/Delete:** As a Manager, you can click the `✏️` (Edit) or `✕` (Delete) buttons next to any product to update its details or remove it.
- **Categories:** You can reorder categories using the Up/Down arrows next to the category headers.

### Parties
Navigate to the **Parties** tab to manage customers and suppliers.
- **Add a Party:** Type the Party Name and click **Add Party**.
- **Remove a Party:** Click the `🗑` icon next to a party's name.

---

## 3. Core Inventory Operations

### Opening Stock
Navigate to the **Opening Stock** tab to set the baseline inventory.
- Select a Godown using the tabs inside the page.
- Enter the opening quantities for each product.
- Enter any Physical or CRM stock counts for reconciliation.
- Changes are saved automatically as you type.

### Transfers (Moving Stock)
Navigate to the **Transfers** tab to move stock between Godowns.
1. Select the **From Godown** (you have permission to choose any godown).
2. Select the **To Godown**.
3. Enter a Reference Number and Date.
4. Fill in the quantities being transferred for each product.
5. Click **Record Transfer**.

### Adjustments (Damages & Shortages)
Navigate to the **Adjustments** tab to fix stock discrepancies.
1. Select the Date and Godown.
2. Select the **Type** (e.g., Damage, Shortage, Found).
3. Enter a reason.
4. Enter the quantities to adjust. Negative quantities will reduce stock.
5. Click **Record Adjustment**.
*Note: If you are recording a negative adjustment for damaged goods, you can check "Also log this to Scrap Tracker" to automatically push it to the scrap bin.*

### Scrap Tracker
Navigate to the **Scrap Tracker** tab to manage waste, rejected, or damaged materials.
- **Log Scrap:** Add items directly to the scrap bin by selecting the Date, Godown, Reason, and Quantities.
- **Sell/Dispose:** When scrap is sold or disposed of, you can update its status to "Disposed" and enter a **Disposal Value**.

### Third-Party Stock
Navigate to the **Third Party Stock** tab to manage materials stored at external locations (e.g., job workers or customer sites).
- **Add Stock:** Record items sent to a third party.
- **Consume/Return:** Click **Consume/Return** on an existing entry to specify how much of the stock was used up, brought back, or consumed during a sale.

---

## 4. Trading Operations

### Purchases (Inward Stock)
Navigate to the **Purchases** tab to record inward goods.
1. Select the Date, Supplier (Party), and Bill Number.
2. Specify the Type (e.g., Normal, Against Order).
3. Enter the quantities purchased per product.
4. (Optional) Enter specific **Serial Numbers** for the received products if tracking is required.
5. Click **Save Purchase**. 

### Sales (Outward Stock)
Navigate to the **Sales** tab to record outward goods.
1. Select the Date, Customer (Party), and Bill Number.
2. Specify the Type (e.g., Normal, Export).
3. (Optional) If selling from Third-Party stock instead of your godown, select the **Third Party Source**.
4. Enter the quantities sold per product.
5. (Optional) Assign **Serial Numbers** being dispatched.
6. Click **Save Sale**.

### DCWR (Delivery Challan Without Return)
Navigate to the **DCWR** tab to manage goods sent out on approval or returnable basis.
- **DCWR Out:** Record goods leaving the godown. Enter the Challan No, Party, and items.
- **DCWR In:** When goods return, record a DCWR In against the original Challan. This will clear the pending out-warded stock.

*Note: For Purchases, Sales, and DCWR, only Administrators have the permission to Delete or Edit past records.*

---

## 5. Reports & Analytics

### The Dashboard (Home)
The **Home** tab provides a real-time snapshot of your operations:
- **Alerts:** Low stock warnings and pending Unbilled Sales.
- **Quick Stats:** Total stock, pending third-party stock, and recent activity.
- **Recent Transactions:** A mini-feed of the latest sales, purchases, and transfers.

### Statement
Navigate to the **Statement** tab for a comprehensive, printable view of the inventory.
- View the mathematical breakdown: `Opening + Purchases + DCWR In - Sales - Adjustments = Final Stock`.
- Compare the system's **Final Stock** against **Physical** and **CRM** counts to spot discrepancies instantly.

### Exporting Data
As a Manager, you can export the entire system state for reporting:
- **Export Excel:** Click the `📊 Export Excel` button in the top right header dropdown to download a multi-sheet Excel file containing all tables, transactions, and statements.
- **Export JSON:** Click the `⬇ Export JSON` button for a full system backup.

---

*End of Manual*
