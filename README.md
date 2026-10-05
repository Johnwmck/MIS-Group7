# Team 7 Books

MIS 321 Team 7 bookstore project for browsing books, placing demo orders, and
managing the catalog and inventory.

## Run locally

1. Install the .NET 10 SDK.
2. Open a terminal in this repository's root folder and run:

   ```sh
   dotnet run --project API/Team7Books.Api.csproj --launch-profile http
   ```

3. Open http://localhost:5187 in your browser.

Keep the terminal running while using the site. Press Ctrl+C to stop the server.
You do not need a separate frontend server or matching folder paths across
teammates' computers. Open the browser link rather than opening HTML files directly.
Bootstrap and book cover images require internet access.

## Pages

- **Customer home:** Browse, search, and filter books; view details and add to cart.
- **Cart and checkout:** Adjust quantities and place demo orders.
- **Internal login:** Open http://localhost:5187/login.html to access employee or
  admin pages.
- **Employee:** Manage inventory and availability; view browser demo orders.
- **Admin:** Add, edit, and delete books; manage inventory and view reports.
- **API catalog preview:** Open http://localhost:5187/index.html?catalog=api to
  browse the catalog managed by Admin. Purchasing is disabled in this preview.

## Demo accounts

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin123` |
| Employee | `employee` | `employee123` |

These are fake accounts for the local prototype.

## Current demo behavior

Admin and Employee share the server catalog. It starts with two sample books and
resets when the server restarts. Refresh a page to see changes made on another page.

The regular customer catalog, cart, and orders still use separate browser storage.
Customer purchases do not yet change the server catalog's inventory. Admin's
**Reset Browser Demo Data** resets browser demo data, not the server catalog.
