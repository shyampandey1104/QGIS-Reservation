import frappe

SURVEYS = [
    {
        "property_type": "Commercial Shop",
        "plot_area": "850",
        "constructed_area": "620",
        "carpet_area": "540",
        "existing_usage": "Grocery Store",
        "address": "Shop No. 3, Market Road, Bhayander West, Mira-Bhayander",
        "geo_location": "19.3082, 72.8591",
        "tenant_name": "Ramesh Gupta",
        "contact": "9876543210",
        "rental_period": "01 Apr 2025 - 31 Mar 2026",
        "status": "Submitted"
    },
    {
        "property_type": "Residential Flat",
        "plot_area": "1200",
        "constructed_area": "980",
        "carpet_area": "850",
        "existing_usage": "Residential",
        "address": "Flat 402, Shanti Nagar CHS, Mira Road East",
        "geo_location": "19.2850, 72.8720",
        "tenant_name": "Sunita Sharma",
        "contact": "9823456710",
        "rental_period": "01 Jan 2025 - 31 Dec 2025",
        "status": "Submitted"
    },
    {
        "property_type": "Open Land",
        "plot_area": "5400",
        "constructed_area": "0",
        "carpet_area": "0",
        "existing_usage": "Agricultural / Vacant",
        "address": "Survey No. 47, Village Kashigaon, Bhayander",
        "geo_location": "19.2942, 72.8748",
        "tenant_name": "",
        "contact": "",
        "rental_period": "",
        "status": "Draft"
    },
    {
        "property_type": "Commercial Office",
        "plot_area": "2200",
        "constructed_area": "1800",
        "carpet_area": "1600",
        "existing_usage": "Medical Clinic",
        "address": "1st Floor, Sai Complex, Station Road, Mira Road",
        "geo_location": "19.2810, 72.8680",
        "tenant_name": "Dr. Anand Patil",
        "contact": "9911223344",
        "rental_period": "01 Jun 2024 - 31 May 2027",
        "status": "Submitted"
    },
    {
        "property_type": "Industrial Shed",
        "plot_area": "3600",
        "constructed_area": "3100",
        "carpet_area": "2800",
        "existing_usage": "Small Manufacturing Unit",
        "address": "Plot C-14, MIDC Area, Mira Road",
        "geo_location": "19.2735, 72.8610",
        "tenant_name": "Patel Industries",
        "contact": "9700112233",
        "rental_period": "01 Apr 2023 - 31 Mar 2026",
        "status": "Submitted"
    },
    {
        "property_type": "Commercial Shop",
        "plot_area": "600",
        "constructed_area": "480",
        "carpet_area": "420",
        "existing_usage": "Pharmacy",
        "address": "Shop 7, Navghar Market, Bhayander East",
        "geo_location": "19.2712, 72.8655",
        "tenant_name": "Meera Medicals",
        "contact": "9833445566",
        "rental_period": "01 Jul 2025 - 30 Jun 2026",
        "status": "Submitted"
    },
    {
        "property_type": "Residential Bungalow",
        "plot_area": "4000",
        "constructed_area": "2800",
        "carpet_area": "2400",
        "existing_usage": "Residential",
        "address": "Bungalow No. 12, Palm Beach Road, Uttan",
        "geo_location": "19.3195, 72.8530",
        "tenant_name": "Vikram Mehta",
        "contact": "9960770055",
        "rental_period": "01 Mar 2024 - 28 Feb 2026",
        "status": "Submitted"
    },
    {
        "property_type": "Open Land",
        "plot_area": "8200",
        "constructed_area": "0",
        "carpet_area": "0",
        "existing_usage": "Encroached / Under Dispute",
        "address": "Survey No. 108, Dongri Village, Mira Road",
        "geo_location": "19.2578, 72.8672",
        "tenant_name": "",
        "contact": "",
        "rental_period": "",
        "status": "Draft"
    },
    {
        "property_type": "Commercial Shop",
        "plot_area": "750",
        "constructed_area": "600",
        "carpet_area": "520",
        "existing_usage": "Restaurant / Food Stall",
        "address": "Shop 2, Rai Village Market, Rai",
        "geo_location": "19.2818, 72.8705",
        "tenant_name": "Suresh Tiffin Centre",
        "contact": "9844332211",
        "rental_period": "01 Oct 2024 - 30 Sep 2025",
        "status": "Submitted"
    },
    {
        "property_type": "Residential Flat",
        "plot_area": "950",
        "constructed_area": "780",
        "carpet_area": "680",
        "existing_usage": "Residential",
        "address": "Flat 201, Green Valley Apartments, Kashigaon",
        "geo_location": "19.2948, 72.8755",
        "tenant_name": "Kavita Nair",
        "contact": "9977665544",
        "rental_period": "01 Feb 2025 - 31 Jan 2026",
        "status": "Submitted"
    }
]

def run():
    frappe.init(site="qgis_reservation.com")
    frappe.connect()

    # Ensure Property Survey DocType exists
    if not frappe.db.exists("DocType", "Property Survey"):
        print("Property Survey DocType not found. Please run bench migrate first.")
        return

    inserted = 0
    for s in SURVEYS:
        try:
            doc = frappe.get_doc({
                "doctype": "Property Survey",
                "property_type": s["property_type"],
                "plot_area": s["plot_area"],
                "constructed_area": s["constructed_area"],
                "carpet_area": s["carpet_area"],
                "existing_usage": s["existing_usage"],
                "address": s["address"],
                "geo_location": s["geo_location"],
                "tenant_name": s["tenant_name"],
                "contact": s["contact"],
                "rental_period": s["rental_period"],
                "documents": "",
                "status": s["status"]
            })
            doc.insert(ignore_permissions=True)
            print(f"  ✅  Inserted: {doc.name} — {s['property_type']} ({s['existing_usage']})")
            inserted += 1
        except Exception as e:
            print(f"  ❌  Error inserting {s['property_type']}: {e}")

    frappe.db.commit()
    print(f"\n✅ Done! {inserted}/10 records inserted.")
    frappe.destroy()

run()
