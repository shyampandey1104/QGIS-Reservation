import frappe
from frappe.modules.export_file import export_to_files

def main():
    doctype_doc = frappe.get_doc("DocType", "GIS Project")
    fieldname = frappe.scrub("Test Field Scratch")
    
    if not doctype_doc.get("fields", {"fieldname": fieldname}):
        doctype_doc.append("fields", {
            "fieldname": fieldname,
            "label": "Test Field Scratch",
            "fieldtype": "Data",
            "insert_after": "remarks"
        })
        doctype_doc.save(ignore_permissions=True)
        export_to_files(record_list=[["DocType", "GIS Project"]])
        
        frappe.db.updatedb("GIS Project")
        frappe.db.commit()
        frappe.clear_cache(doctype="GIS Project")
        print("Success! Created and exported Test Field Scratch.")
    else:
        print("Field already exists!")
