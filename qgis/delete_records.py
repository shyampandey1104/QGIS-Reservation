import frappe

def execute():
    # Count before deleting
    count = frappe.db.sql("SELECT count(*) FROM `tabGIS Project`")[0][0]
    
    # Truncate the table for fast deletion
    frappe.db.sql("TRUNCATE `tabGIS Project`")
    frappe.db.commit()
    
    print(f"Successfully deleted {count} records from GIS Project.")
