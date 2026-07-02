import frappe

def create():
    if not frappe.db.exists("DocType", "Initiate Work Order"):
        doc = frappe.get_doc({
            "doctype": "DocType",
            "name": "Initiate Work Order",
            "module": "Qgis",
            "custom": 1,
            "fields": [
                {
                    "fieldname": "gis_project",
                    "label": "GIS Project",
                    "fieldtype": "Link",
                    "options": "GIS Project",
                    "reqd": 1
                },
                {
                    "fieldname": "comment",
                    "label": "Comment",
                    "fieldtype": "Text"
                },
                {
                    "fieldname": "attachment",
                    "label": "Attachment",
                    "fieldtype": "Attach"
                }
            ],
            "permissions": [
                {
                    "role": "System Manager",
                    "read": 1,
                    "write": 1,
                    "create": 1,
                    "delete": 1
                }
            ],
            "autoname": "format:IWO-{#####}"
        })
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        print("DocType created successfully.")
    else:
        print("DocType already exists.")

