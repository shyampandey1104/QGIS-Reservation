import frappe

def execute():
    try:
        frappe.db.sql("DELETE FROM `tabGIS Project`")
        frappe.db.sql("DELETE FROM `tabInitiate Work Order`")
        frappe.db.commit()
        print("Successfully force deleted all GIS Project and Work Order records.")
    except Exception as e:
        print("Error:", e)
