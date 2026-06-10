import frappe
import json
import os
import subprocess
import tempfile

# Role hierarchy for workflow
ROLE_TRANSITIONS = {
    "GIS Junior Engineer":      {"can_create": True,  "can_submit": True,  "allowed_from": ["Draft"],       "allowed_to": ["Submitted"]},
    "GIS Assistant Engineer":   {"can_create": False, "can_submit": False, "allowed_from": ["Submitted"],   "allowed_to": ["Approved", "Rejected"]},
    "GIS Senior Engineer":      {"can_create": False, "can_submit": False, "allowed_from": ["Submitted"],   "allowed_to": ["Approved", "Rejected"]},
    "GIS Department Head":      {"can_create": True,  "can_submit": True,  "allowed_from": ["Draft", "Submitted", "Approved", "Rejected"], "allowed_to": ["Draft", "Submitted", "Approved", "Rejected"]},
    "System Manager":           {"can_create": True,  "can_submit": True,  "allowed_from": ["Draft", "Submitted", "Approved", "Rejected"], "allowed_to": ["Draft", "Submitted", "Approved", "Rejected"]},
    "Executive Engineer":       {"can_create": False, "can_submit": False, "allowed_from": ["Submitted", "Pending for Request"], "allowed_to": ["Approved", "Rejected", "Correction"]},
    "City Engineer":            {"can_create": False, "can_submit": False, "allowed_from": ["Submitted", "Pending for Request"], "allowed_to": ["Approved", "Rejected", "Correction"]},
    "Muncipal Commissioner":    {"can_create": False, "can_submit": False, "allowed_from": ["Submitted", "Pending for Request"], "allowed_to": ["Approved", "Rejected", "Correction"]},
}

@frappe.whitelist()
def setup_workflow():
    # 0. Create Roles if they don't exist
    for r in ["Executive Engineer", "City Engineer", "Muncipal Commissioner"]:
        if not frappe.db.exists("Role", r):
            frappe.get_doc({
                "doctype": "Role",
                "role_name": r,
                "desk_access": 1
            }).insert(ignore_permissions=True)
            
    workflow_name = "GIS Project Workflow"
    
    # 1. Create Workflow States if they don't exist
    states = ["Draft", "Submitted", "Approved", "Rejected", "Cancelled", "Pending for Request", "Correction"]
    for s in states:
        if not frappe.db.exists("Workflow State", s):
            frappe.get_doc({
                "doctype": "Workflow State",
                "workflow_state_name": s,
                "style": "Success" if s == "Approved" else "Warning" if s == "Pending for Request" else "Danger" if s == "Rejected" else "Inverse" if s == "Cancelled" else "Info"
            }).insert(ignore_permissions=True)

    # 2. Create Workflow Action Master if they don't exist
    actions = ["Submit", "Approve", "Reject", "Cancel"]
    for a in actions:
        if not frappe.db.exists("Workflow Action Master", a):
            frappe.get_doc({
                "doctype": "Workflow Action Master",
                "workflow_action_name": a
            }).insert(ignore_permissions=True)

    if frappe.db.exists("Workflow", workflow_name):
        frappe.delete_doc("Workflow", workflow_name)
    
    workflow = frappe.get_doc({
        "doctype": "Workflow",
        "workflow_name": workflow_name,
        "document_type": "GIS Project",
        "workflow_state_field": "status",
        "is_active": 1,
        "override_status": 1,
        "states": [
            {"state": "Draft", "doc_status": 0, "allow_edit": "GIS Junior Engineer"},
            {"state": "Submitted", "doc_status": 0, "allow_edit": "GIS Assistant Engineer"},
            {"state": "Approved", "doc_status": 0, "allow_edit": "System Manager"},
            {"state": "Rejected", "doc_status": 0, "allow_edit": "GIS Junior Engineer"},
            {"state": "Cancelled", "doc_status": 0, "allow_edit": "GIS Junior Engineer"},
            {"state": "Pending for Request", "doc_status": 0, "allow_edit": "System Manager"},
            {"state": "Correction", "doc_status": 0, "allow_edit": "GIS Junior Engineer"},
        ],
        "transitions": [
            {"state": "Draft",     "action": "Submit",  "next_state": "Submitted", "allowed": "GIS Junior Engineer"},
            {"state": "Draft",     "action": "Submit",  "next_state": "Submitted", "allowed": "System Manager"},
            {"state": "Draft",     "action": "Submit",  "next_state": "Submitted", "allowed": "GIS Department Head"},
            {"state": "Draft",     "action": "Approve", "next_state": "Approved",  "allowed": "System Manager"},
            {"state": "Draft",     "action": "Approve", "next_state": "Approved",  "allowed": "GIS Department Head"},

            # Direct creation transitions to Pending for Request
            {"state": "Draft",     "action": "Submit",  "next_state": "Pending for Request", "allowed": "GIS Junior Engineer"},
            {"state": "Draft",     "action": "Submit",  "next_state": "Pending for Request", "allowed": "GIS Assistant Engineer"},
            {"state": "Draft",     "action": "Submit",  "next_state": "Pending for Request", "allowed": "GIS Senior Engineer"},
            {"state": "Draft",     "action": "Submit",  "next_state": "Pending for Request", "allowed": "GIS Department Head"},
            {"state": "Draft",     "action": "Submit",  "next_state": "Pending for Request", "allowed": "System Manager"},
            
            {"state": "Submitted", "action": "Approve", "next_state": "Approved",  "allowed": "GIS Assistant Engineer"},
            {"state": "Submitted", "action": "Approve", "next_state": "Approved",  "allowed": "GIS Senior Engineer"},
            {"state": "Submitted", "action": "Approve", "next_state": "Approved",  "allowed": "GIS Department Head"},
            {"state": "Submitted", "action": "Approve", "next_state": "Approved",  "allowed": "System Manager"},
            
            {"state": "Submitted", "action": "Reject",  "next_state": "Rejected",  "allowed": "GIS Assistant Engineer"},
            {"state": "Submitted", "action": "Reject",  "next_state": "Rejected",  "allowed": "GIS Department Head"},
            {"state": "Submitted", "action": "Reject",  "next_state": "Rejected",  "allowed": "System Manager"},
            
            {"state": "Submitted", "action": "Cancel",  "next_state": "Cancelled", "allowed": "GIS Assistant Engineer"},
            {"state": "Submitted", "action": "Cancel",  "next_state": "Cancelled", "allowed": "GIS Department Head"},
            {"state": "Submitted", "action": "Cancel",  "next_state": "Cancelled", "allowed": "System Manager"},
            
            {"state": "Draft",     "action": "Cancel",  "next_state": "Cancelled", "allowed": "GIS Junior Engineer"},
            {"state": "Approved",  "action": "Cancel",  "next_state": "Cancelled", "allowed": "System Manager"},
            {"state": "Rejected",  "action": "Cancel",  "next_state": "Cancelled", "allowed": "System Manager"},

            # Multi-level Custom workflow transitions
            {"state": "Pending for Request", "action": "Approve", "next_state": "Pending for Request", "allowed": "Executive Engineer"},
            {"state": "Pending for Request", "action": "Approve", "next_state": "Pending for Request", "allowed": "City Engineer"},
            {"state": "Pending for Request", "action": "Approve", "next_state": "Submitted", "allowed": "Muncipal Commissioner"},
            {"state": "Pending for Request", "action": "Approve", "next_state": "Submitted", "allowed": "System Manager"},
            
            {"state": "Pending for Request", "action": "Reject",  "next_state": "Rejected",  "allowed": "Executive Engineer"},
            {"state": "Pending for Request", "action": "Reject",  "next_state": "Rejected",  "allowed": "City Engineer"},
            {"state": "Pending for Request", "action": "Reject",  "next_state": "Rejected",  "allowed": "Muncipal Commissioner"},
            {"state": "Pending for Request", "action": "Reject",  "next_state": "Rejected",  "allowed": "System Manager"},
            
            {"state": "Pending for Request", "action": "Cancel",  "next_state": "Correction", "allowed": "Executive Engineer"},
            {"state": "Pending for Request", "action": "Cancel",  "next_state": "Correction", "allowed": "City Engineer"},
            {"state": "Pending for Request", "action": "Cancel",  "next_state": "Correction", "allowed": "Muncipal Commissioner"},
            {"state": "Pending for Request", "action": "Cancel",  "next_state": "Correction", "allowed": "System Manager"},

            {"state": "Correction",          "action": "Submit",  "next_state": "Pending for Request", "allowed": "GIS Junior Engineer"},
            {"state": "Correction",          "action": "Submit",  "next_state": "Pending for Request", "allowed": "System Manager"},
            {"state": "Correction",          "action": "Cancel",  "next_state": "Cancelled", "allowed": "GIS Junior Engineer"},
            {"state": "Correction",          "action": "Cancel",  "next_state": "Cancelled", "allowed": "System Manager"},
        ]
    })
    workflow.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "message": "Workflow created successfully"}


def _get_user_gis_role():
    user_roles = frappe.get_roles(frappe.session.user)
    if "System Manager" in user_roles or frappe.session.user == "Administrator":
        return "System Manager"
    for role in ["Executive Engineer", "City Engineer", "Muncipal Commissioner"]:
        if role in user_roles:
            return role
    for role in ["GIS Department Head", "GIS Senior Engineer", "GIS Assistant Engineer", "GIS Junior Engineer"]:
        if role in user_roles:
            return role
    return None


def _serialize(p, geometry, wo=None, fetch_wo_if_none=True):
    # Retrieve actual layer name from description if saved by manual upload
    p_type = p.get("project_type")
    desc = p.get("description") or ""
    if "LAYER_TYPE:" in desc:
        try:
            p_type = desc.split("LAYER_TYPE:")[1].split(" |")[0].strip()
        except: pass

    res = {
        "id": p.get("name"),
        "name": p.get("project_name") or p.get("name"),
        "road_name": p.get("road_name"),
        "ward": p.get("ward"),
        "type": p_type or "Unknown",
        "status": p.get("status") or "Draft",
        "budget": p.get("budget"),
        "road_length": p.get("road_length"),
        "contractor_details": p.get("contractor_details"),
        "start_date": str(p.get("start_date")) if p.get("start_date") else None,
        "completion_date": str(p.get("completion_date")) if p.get("completion_date") else None,
        "description": desc,
        "remarks": p.get("remarks"),
        "color": p.get("color"),
        "submitted_by_role": p.get("submitted_by_role"),
        "coordinates": geometry.get("coordinates") if geometry else [],
        "geom_type": geometry.get("type") if geometry else "Polygon",
        "created_at": str(p.get("creation")) if p.get("creation") else None,
        "owner": p.get("owner"),
        "road_no": p.get("road_no"),
        "road_type": p.get("road_type"),
        "pave_type": p.get("pave_type"),
        "landmark": p.get("landmark"),
        "authority": p.get("authority"),
        "traffic": p.get("traffic"),
        "width": p.get("width"),
        "shape_length": p.get("shape_length"),
        "unp_name": p.get("unp_name"),
        "unp_type": p.get("unp_type"),
        "dma_no": p.get("dma_no"),
        "ward_no": p.get("ward_no"),
        "junc_name": p.get("junc_name"),
        "facility": p.get("facility"),
        "rail_route": p.get("rail_route"),
        "bridg_type": p.get("bridg_type"),
        "fly_name": p.get("fly_name"),
    }
    
    # Query latest Initiate Work Order for this project's details
    if wo is None and fetch_wo_if_none:
        latest_wo = frappe.get_all(
            "Initiate Work Order",
            filters={"gis_project": p.get("name")},
            fields=["name", "approver", "comment", "attachment"],
            order_by="creation desc",
            limit=1,
            ignore_permissions=True
        )
        wo = latest_wo[0] if latest_wo else None

    if wo:
        if wo.get("approver"):
            res["approver"] = wo.get("approver")
        if wo.get("comment"):
            res["wo_comment"] = wo.get("comment")
        if wo.get("attachment"):
            res["wo_attachment"] = wo.get("attachment")
        if wo.get("name"):
            res["wo_id"] = wo.get("name")

    
    # Merge custom attributes
    custom_attrs_str = p.get("custom_attributes")
    if custom_attrs_str:
        try:
            custom_attrs = json.loads(custom_attrs_str)
            if isinstance(custom_attrs, dict):
                for k, v in custom_attrs.items():
                    res[k] = v
        except Exception:
            pass
            
    timeline_str = p.get("timeline")
    timeline_data = []
    if timeline_str:
        try:
            timeline_data = json.loads(timeline_str)
        except Exception:
            pass
    res["timeline"] = timeline_data

    # Dynamic project journey stages definition
    res["stages"] = [
        {"status": "Approved",        "label": "Approved",        "icon": "📋", "color": "#16a34a"},
        {"status": "Work Started",    "label": "Work Started",    "icon": "🔨", "color": "#16a34a"},
        {"status": "Ongoing",         "label": "Ongoing",         "icon": "⚙️", "color": "#16a34a"},
        {"status": "On Hold",         "label": "On Hold",         "icon": "⏸",  "color": "#16a34a"},
        {"status": "Near Completion", "label": "Near Completion", "icon": "🏁", "color": "#16a34a"},
        {"status": "Completed",       "label": "Completed",       "icon": "✅", "color": "#14532d"},
    ]

    return res


@frappe.whitelist(allow_guest=True)
def get_public_stats():
    """Dynamic stats for login page and public portal"""
    all_projects = frappe.get_all(
        "GIS Project",
        fields=["status", "ward", "budget"],
        ignore_permissions=True
    )
    approved = [p for p in all_projects if p["status"] in ["Approved", "Work Started", "Ongoing", "On Hold", "Hold", "Near Completion", "Completed"]]

    # Count unique wards
    wards = set(p["ward"] for p in all_projects if p.get("ward"))

    # Sum total budget from all projects
    total_budget = 0
    for p in all_projects:
        if p.get("budget"):
            try:
                num = float(''.join(c for c in str(p["budget"]) if c.isdigit() or c == '.'))
                total_budget += num
            except Exception:
                pass

    def fmt_budget(n):
        if n >= 10000000:
            return f"₹{round(n/10000000, 1)}Cr"
        if n >= 100000:
            return f"₹{round(n/100000, 1)}L"
        return f"₹{int(n):,}"

    submitted = [p for p in all_projects if p["status"] == "Submitted"]

    return {
        "total": len(all_projects),
        "approved": len(approved),
        "submitted": len(submitted),
        "total_wards": len(wards),
        "total_budget_formatted": fmt_budget(total_budget),
        "total_budget_raw": total_budget,
    }


@frappe.whitelist(allow_guest=True)
def get_projects(status=None, limit=None, omit_geometry=False):
    filters = {}
    if status:
        if "," in status:
            filters["status"] = ["in", [s.strip() for s in status.split(",")]]
        else:
            filters["status"] = status



    # Non-logged-in users only see approved and post-approval statuses
    if frappe.session.user == "Guest":
        filters["status"] = ["in", ["Approved", "Work Started", "Ongoing", "On Hold", "Hold", "Near Completion", "Completed"]]

    if limit:
        limit = int(limit)
    
    # Handle string "true"/"false" from frontend
    if isinstance(omit_geometry, str):
        omit_geometry = omit_geometry.lower() == "true"

    cache_key = f"gis_projects_cache_{frappe.session.user}_{status}_{limit}_{omit_geometry}"
    cached_data = frappe.cache().get_value(cache_key)
    if cached_data:
        return cached_data

    if omit_geometry:
        meta = frappe.get_meta("GIS Project")
        fields = ["name", "owner", "creation", "modified", "docstatus"]
        from frappe.model import no_value_fields
        for f in meta.fields:
            if f.fieldname and f.fieldname != "geometry" and f.fieldtype not in no_value_fields:
                fields.append(f.fieldname)
    else:
        fields = ["*"]

    projects = frappe.get_all(
        "GIS Project",
        filters=filters,
        fields=fields,
        order_by="creation desc",
        limit=limit,
        ignore_permissions=True
    )

    project_names = [p.name for p in projects if p.get("name")]
    wo_map = {}
    if project_names:
        wos = frappe.get_all(
            "Initiate Work Order",
            filters={"gis_project": ["in", project_names]},
            fields=["name", "gis_project", "approver", "comment", "attachment"],
            order_by="creation desc",
            ignore_permissions=True
        )
        for w in wos:
            pid = w.get("gis_project")
            if pid and pid not in wo_map:
                wo_map[pid] = w

    # Secure role-based queue visibility: Only show active workflow layers to the current approver, owner, or admins
    user = frappe.session.user
    user_roles = frappe.get_roles(user)
    is_admin = "System Manager" in user_roles or user == "Administrator"

    # These statuses are always visible to all logged-in users (post-approval journey)
    ALWAYS_VISIBLE_STATUSES = [
        "Approved", "Submitted",
        "Work Started", "Ongoing", "On Hold", "Hold",
        "Near Completion", "Completed"
    ]

    filtered_projects = []
    for p in projects:
        # Admins see all
        if is_admin:
            filtered_projects.append(p)
            continue
        # Project owner/creator sees their own projects at all times
        if p.get("owner") == user:
            filtered_projects.append(p)
            continue
        # Approved + all post-approval statuses are always visible to everyone (never disappear)
        if p.get("status") in ALWAYS_VISIBLE_STATUSES:
            filtered_projects.append(p)
            continue
        # Workflow projects only visible to their assigned approver role
        if p.get("status") in ["Pending for Request", "Correction"]:
            wo = wo_map.get(p.get("name"))
            if wo and wo.get("approver") in user_roles:
                filtered_projects.append(p)
                continue

    projects = filtered_projects

    result = []
    for p in projects:
        geo = None
        if not omit_geometry and p.get("geometry"):
            try:
                geom_str = p["geometry"].strip() if isinstance(p["geometry"], str) else "{}"
                if geom_str:
                    geo = json.loads(geom_str)
            except Exception:
                geo = {"type": "Polygon", "coordinates": []}
        
        try:
            result.append(_serialize(p, geo, wo_map.get(p.get("name")), fetch_wo_if_none=False))
        except Exception as e:
            frappe.log_error(f"Serialization failed for {p.get('name')}: {str(e)}", "GIS API Error")
            continue
            
    frappe.cache().set_value(cache_key, result, expires_in_sec=3600)
    return result


@frappe.whitelist(allow_guest=True)
def get_approved_projects():
    # Public portal should see all projects that are Approved, Work Started, Ongoing, On Hold/Hold, Near Completion, Completed
    statuses = ["Approved", "Work Started", "Ongoing", "On Hold", "Hold", "Near Completion", "Completed"]
    return get_projects(status=",".join(statuses))


@frappe.whitelist()
def get_project(project_id):
    if not project_id:
        frappe.throw("Project ID is required.")
    
    doc = frappe.get_doc("GIS Project", project_id)
    geo = None
    if doc.geometry:
        try:
            geo = json.loads(doc.geometry)
        except Exception:
            pass
            
    return _serialize(doc, geo)


@frappe.whitelist(allow_guest=True)
def get_current_user_role():
    role = _get_user_gis_role()
    return {
        "user": frappe.session.user,
        "role": role,
        "permissions": ROLE_TRANSITIONS.get(role, {}),
    }


@frappe.whitelist()
def create_project(
    project_name, ward, project_type, coordinates,
    geom_type="Polygon",
    description=None, budget=None, road_length=None,
    contractor_details=None, start_date=None,
    completion_date=None, remarks=None,
    road_name=None, road_no=None, road_type=None,
    pave_type=None, landmark=None, authority=None,
    traffic=None, width=None, shape_length=None,
    unp_name=None, unp_type=None, color=None
):
    role = _get_user_gis_role()
    if not role:
        frappe.throw("You do not have a GIS role assigned.")

    perms = ROLE_TRANSITIONS.get(role, {})
    if not perms.get("can_create"):
        frappe.throw(f"Role '{role}' is not allowed to create projects.")

    if isinstance(coordinates, str):
        coordinates = json.loads(coordinates)

    # Map Leaflet Draw types to GeoJSON types
    final_geom_type = "Polygon"
    if geom_type.lower() in ["polyline", "linestring"]:
        final_geom_type = "LineString"
    elif geom_type.lower() in ["marker", "point"]:
        final_geom_type = "Point"
        if coordinates and isinstance(coordinates[0], list):
            coordinates = coordinates[0] # Point should not be nested twice

    geometry = json.dumps({"type": final_geom_type, "coordinates": coordinates})

    # CRITICAL: Log the received color for debugging
    frappe.log_error(f"GIS Create: Name={project_name}, Color={color}, Type={final_geom_type}", "GIS Debug")

    doc = frappe.get_doc({
        "doctype": "GIS Project",
        "project_name": project_name,
        "ward": ward,
        "project_type": project_type,
        "description": description,
        "budget": budget,
        "road_length": road_length,
        "contractor_details": contractor_details,
        "start_date": start_date or None,
        "completion_date": completion_date or None,
        "remarks": remarks,
        "status": "Draft",
        "submitted_by_role": role,
        "geometry": geometry,
        "road_name": road_name,
        "road_no": road_no,
        "road_type": road_type,
        "pave_type": pave_type,
        "landmark": landmark,
        "authority": authority,
        "traffic": traffic,
        "width": width,
        "shape_length": shape_length,
        "unp_name": unp_name,
        "unp_type": unp_type,
        "color": color or "#2563eb",
    })
    doc.insert(ignore_permissions=True, ignore_mandatory=True)
    
    # Update status programmatically to 'Draft' post-insert to keep it as draft until initiated
    frappe.db.set_value("GIS Project", doc.name, "status", "Draft")
    
    # Set default color to Blue (#2563eb) for Draft projects
    final_color = color or "#2563eb"
    frappe.db.set_value("GIS Project", doc.name, "color", final_color)
    
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()

    return {
        "id": doc.name,
        "name": doc.project_name,
        "ward": doc.ward,
        "type": doc.project_type,
        "status": doc.status,
        "coordinates": coordinates,
    }


@frappe.whitelist()
def update_status(project_id, status, comment=None):
    doc = frappe.get_doc("GIS Project", project_id)
    doc.flags.ignore_workflow = True
    user_role = _get_user_gis_role()
    
    # If the document is currently Submitted (docstatus == 1) but we are transitioning 
    # back to any other active state (like Correction or Pending for Request), reset docstatus to 0 (Draft)
    # to allow editing and save operations without throwing UpdateAfterSubmitError.
    if doc.docstatus == 1 and status != "Approved":
        doc.db_set("docstatus", 0)
        doc.docstatus = 0
        frappe.db.commit()
        
    # Correction Resubmission: transitions the status back to 'Pending for Request' and assigns to Executive Engineer
    if status in ["Submitted", "Pending for Request"] and doc.status == "Correction":
        new_wo = frappe.get_doc({
            "doctype": "Initiate Work Order",
            "gis_project": project_id,
            "approver": "Executive Engineer",
            "comment": comment or "Resubmitted after correction."
        })
        new_wo.insert(ignore_permissions=True)
        
        doc.status = "Pending for Request"
        doc.color = "#ea580c"
        doc.remarks = comment or "Resubmitted after correction."
        doc.save(ignore_permissions=True)
        frappe.cache().delete_keys("gis_projects_cache_")
        frappe.db.commit()
        return {"id": project_id, "status": doc.status}
        
    # Correction workflow: assigns the work order back to the GIS Junior Engineer (requester)
    if status == "Correction":
        doc.status = "Correction"
        doc.remarks = comment or "Sent for Correction"
        doc.save(ignore_permissions=True)
        
        latest_wo = frappe.get_all(
            "Initiate Work Order",
            filters={"gis_project": project_id},
            order_by="creation desc",
            limit=1,
            ignore_permissions=True
        )
        if latest_wo:
            frappe.db.set_value("Initiate Work Order", latest_wo[0].name, {
                "approver": "GIS Junior Engineer",
                "comment": comment or "Sent for Correction"
            })
        else:
            new_wo = frappe.get_doc({
                "doctype": "Initiate Work Order",
                "gis_project": project_id,
                "approver": "GIS Junior Engineer",
                "comment": comment or "Sent for Correction"
            })
            new_wo.insert(ignore_permissions=True)
            
        frappe.cache().delete_keys("gis_projects_cache_")
        frappe.db.commit()
        return {"id": project_id, "status": doc.status}

    # 1. Intermediate Approval Workflow (Level 1 -> Level 2 -> Level 3)
    if status == "Approved" and user_role in ["Executive Engineer", "City Engineer"]:
        # Find next level approver
        next_approver = "City Engineer" if user_role == "Executive Engineer" else "Muncipal Commissioner"
        
        # Retrieve latest work order details to preserve dynamic attachments
        latest_wo = frappe.get_all(
            "Initiate Work Order",
            filters={"gis_project": project_id},
            fields=["attachment"],
            order_by="creation desc",
            limit=1,
            ignore_permissions=True
        )
        attachment = latest_wo[0].get("attachment") if latest_wo else None
        
        # Create a new Work Order record for the next level
        new_wo = frappe.get_doc({
            "doctype": "Initiate Work Order",
            "gis_project": project_id,
            "approver": next_approver,
            "comment": comment or f"Approved by {user_role}",
            "attachment": attachment
        })
        new_wo.insert(ignore_permissions=True)
        
        # Keep status as "Pending for Request" to remain active in the workflow queue
        doc.status = "Pending for Request"
        doc.remarks = comment or f"Approved by {user_role}"
        doc.save(ignore_permissions=True)
        frappe.cache().delete_keys("gis_projects_cache_")
        frappe.db.commit()
        return {"id": project_id, "status": doc.status}
    
    # 2. Final Approval by Muncipal Commissioner transitions the status to "Approved"
    if status == "Approved" and user_role == "Muncipal Commissioner":
        doc.db_set("status", "Approved")
        doc.db_set("color", "#16a34a") # Set color to Green (#16a34a)
        doc.db_set("remarks", comment or "Approved by Muncipal Commissioner")
        doc.db_set("docstatus", 1)
        frappe.cache().delete_keys("gis_projects_cache_")
        frappe.db.commit()
        return {"id": project_id, "status": "Approved"}
    
    if comment:
        doc.remarks = comment
        # Query latest Initiate Work Order for this project and update comment
        latest_wo = frappe.get_all(
            "Initiate Work Order",
            filters={"gis_project": project_id},
            order_by="creation desc",
            limit=1,
            ignore_permissions=True
        )
        if latest_wo:
            frappe.db.set_value("Initiate Work Order", latest_wo[0].name, "comment", comment)
            frappe.db.commit()
    
    # Map status to Workflow Actions
    action_map = {
        "Submitted": "Submit",
        "Approved": "Approve",
        "Rejected": "Reject",
        "Cancelled": "Cancel"
    }
    
    action = action_map.get(status)
    if action:
        from frappe.model.workflow import apply_workflow
        try:
            apply_workflow(doc, action)
            frappe.cache().delete_keys("gis_projects_cache_")
            frappe.db.commit()
            return {"id": project_id, "status": doc.status}
        except Exception as e:
            frappe.log_error(f"Workflow action '{action}' failed for {project_id}: {str(e)}", "GIS Workflow Error")
            # Fall through to manual update
    
    # Fallback logic
    doc.status = status
    doc.save(ignore_permissions=True)
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()
    return {"id": project_id, "status": doc.status}


@frappe.whitelist()
def update_geometry(project_id, coordinates):
    role = _get_user_gis_role()
    if not role:
        frappe.throw("You do not have a GIS role assigned.")
    if isinstance(coordinates, str):
        coordinates = json.loads(coordinates)
    
    doc = frappe.get_doc("GIS Project", project_id)
    
    # Preserve original geom_type if possible, otherwise guess from coordinates
    # For now, let's stick to what's in the doc or default to Polygon
    geo = json.loads(doc.geometry) if doc.geometry else {"type": "Polygon"}
    current_type = geo.get("type", "Polygon")
    
    doc.geometry = json.dumps({"type": current_type, "coordinates": coordinates})
    doc.save(ignore_permissions=True)
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()
    return {"id": project_id, "updated": True}


@frappe.whitelist()
def delete_project(project_id):
    role = _get_user_gis_role()
    if role not in ["GIS Junior Engineer", "System Manager", "GIS Department Head", "Administrator"]:
        frappe.throw("Only Junior Engineers, Department Heads, or System Managers can delete projects.")

    doc = frappe.get_doc("GIS Project", project_id)
    if doc.status != "Draft" and role not in ["GIS Department Head", "System Manager", "Administrator"]:
        frappe.throw("Only Draft projects can be deleted by Engineers.")

    frappe.delete_doc("GIS Project", project_id, ignore_permissions=True)
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()
    return {"message": "Deleted"}


@frappe.whitelist()
def upload_manual_data(ward="Manual Upload", project_type="Other Infrastructure"):
    if not frappe.request.files:
        return {"success": False, "error": "No file provided"}
        
    uploaded_file = frappe.request.files.get("file")
    if not uploaded_file:
        return {"success": False, "error": "Field 'file' missing"}
    
    role = _get_user_gis_role()
    if not role:
        frappe.throw("You do not have a GIS role assigned.")

    # Save to temp file
    uploaded_file.seek(0)
    cnt = uploaded_file.read()
    suffix = os.path.splitext(uploaded_file.filename)[1].lower()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
        tf.write(cnt)
        temp_path = tf.name

    def _flip_coords(coords):
        """Recursively flip [lng, lat] to [lat, lng]"""
        if isinstance(coords[0], (int, float)):
            return [coords[1], coords[0]]
        return [_flip_coords(c) for c in coords]

    try:
        import zipfile
        import shutil
        extract_dir = None
        files_to_process = []
        
        if suffix == ".zip":
            extract_dir = tempfile.mkdtemp()
            with zipfile.ZipFile(temp_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            for root, dirs, files in os.walk(extract_dir):
                for f in files:
                    if f.lower().endswith(('.shp', '.geojson', '.kml', '.gpkg')) and not f.startswith("._"):
                        files_to_process.append(os.path.join(root, f))
            if not files_to_process:
                if extract_dir:
                    shutil.rmtree(extract_dir)
                os.unlink(temp_path)
                return {"success": False, "error": "No valid GIS files (.shp, .geojson, .gpkg, .kml) found in the zip archive."}
        else:
            path_to_read = temp_path
            if suffix in [".kmz", ".qgz"]:
                path_to_read = f"/vsizip/{temp_path}"
            files_to_process = [path_to_read]

        saved_count = 0
        
        for fpath in files_to_process:
            # 1. Get List of Layers
            ogrinfo_path = shutil.which("ogrinfo") or "/usr/bin/ogrinfo"
            info_cmd = [ogrinfo_path, "-ro", "-q", fpath]
            try:
                info_res = subprocess.run(info_cmd, capture_output=True, text=True, check=True)
            except subprocess.CalledProcessError as e:
                if suffix == ".qgz":
                    if extract_dir: shutil.rmtree(extract_dir)
                    os.unlink(temp_path)
                    return {"success": False, "error": "You uploaded a QGIS Project file (.qgz). This file only contains styling and settings. Please upload the actual data file (like GeoJSON, GeoPackage, KML, or a Zipped Shapefile)."}
                continue
            except FileNotFoundError:
                if extract_dir: shutil.rmtree(extract_dir)
                os.unlink(temp_path)
                return {"success": False, "error": "GDAL/ogrinfo not installed on server. Please install gdal-bin."}
            
            layer_names = []
            for line in info_res.stdout.splitlines():
                if ": " in line:
                    name = line.split(": ")[1].split(" (")[0].strip()
                    if name: layer_names.append(name)
                elif line.startswith("1: "):
                    name = line.split("1: ")[1].split(" (")[0].strip()
                    if name: layer_names.append(name)

            if not layer_names:
                layer_names = ["OGRGeoJSON"]

            # 2. Extract and SAVE each feature to GIS Project DocType
            for layer in layer_names:
                ogr2ogr_path = shutil.which("ogr2ogr") or "/usr/bin/ogr2ogr"
                cmd = [ogr2ogr_path, "-f", "GeoJSON", "-t_srs", "EPSG:4326", "/vsistdout/", fpath, layer]
                try:
                    out = subprocess.run(cmd, capture_output=True, text=True)
                    if not out.stdout.strip():
                        continue
                    geojson = json.loads(out.stdout)
                except Exception as e:
                    frappe.log_error(f"ogr2ogr failed for {layer}: {str(e)}", "GIS Error")
                    continue

                for feature in geojson.get("features", []):
                        geom = feature.get("geometry")
                        if not geom or "coordinates" not in geom: continue
                        
                        # Flip coordinates to [lat, lng] for UI consistency
                        geom["coordinates"] = _flip_coords(geom["coordinates"])
                        
                        props = feature.get("properties", {})
                        
                        # Create a unique name or use property if exists
                        p_name = props.get("name") or props.get("road_name") or f"{layer} Feature {saved_count+1}"
                        # Ensure name is within Frappe's 140 char limit
                        if len(p_name) > 140:
                            p_name = p_name[:137] + "..."
                        
                        final_type = layer
                        if final_type == "OGRGeoJSON" and suffix == ".zip":
                            final_type = os.path.splitext(os.path.basename(fpath))[0]

                        doc = frappe.get_doc({
                            "doctype": "GIS Project",
                            "project_name": p_name,
                            "ward": ward,
                            "project_type": final_type, 
                            "status": "Draft",
                            "description": f"LAYER_TYPE:{layer} | Imported from {uploaded_file.filename}",
                            "submitted_by_role": role,
                            "geometry": json.dumps(geom),
                            "remarks": props.get("Remark") or props.get("remarks") or f"Source Layer: {layer}",
                            "road_name": props.get("road_name") or props.get("name") or props.get("fly_name") or props.get("bridg_name") or props.get("unp_name") or props.get("Rail_Route"),
                            "road_no": props.get("road_no") or props.get("road_num"),
                            "road_type": props.get("road_type") or props.get("bridg_type") or props.get("unp_type"),
                            "pave_type": props.get("pave_type"),
                            "landmark": props.get("landmark"),
                            "authority": props.get("authority"),
                            "traffic": props.get("traffic"),
                            "width": props.get("width"),
                            "shape_length": props.get("SHAPE_Leng") or props.get("shape_leng"),
                            "unp_name": props.get("unp_name"),
                            "unp_type": props.get("unp_type") or props.get("bridg_type"),
                            "road_length": props.get("length") or props.get("road_length") or props.get("SHAPE_Leng"),
                            "dma_no": props.get("dma_no"),
                            "ward_no": props.get("ward_no") or props.get("ward"),
                            "junc_name": props.get("junc_name"),
                            "facility": props.get("Facility") or props.get("facility"),
                            "rail_route": props.get("Rail_Route") or props.get("rail_route"),
                            "bridg_name": props.get("bridg_name"),
                            "bridg_type": props.get("bridg_type"),
                            "fly_name": props.get("fly_name")
                        })
                        doc.insert(ignore_permissions=True, ignore_mandatory=True)
                        saved_count += 1
                        
                        # Commit every 100 records to prevent tabSeries lock/contention
                        if saved_count % 100 == 0:
                            frappe.db.commit()
        
        frappe.cache().delete_keys("gis_projects_cache_")
        frappe.db.commit()
        # Cleanup
        os.unlink(temp_path)
        if extract_dir:
            shutil.rmtree(extract_dir)
        
        return {
            "success": True,
            "message": f"Successfully imported {saved_count} features into GIS Project DocType",
            "saved_count": saved_count
        }
        
    except Exception as e:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        return {"success": False, "error": str(e)}


@frappe.whitelist(allow_guest=True)
def get_nearby_places(lat, lng, radius=1000, place_type=None):
    """
    Fetch nearby nodes from OpenStreetMap using Overpass API.
    Detailed info about schools, hospitals, temples, etc.
    """
    import requests
    
    TYPE_MAP = {
        "school": 'node["amenity"="school"]',
        "hospital": 'node["amenity"="hospital"]',
        "temple": 'node["amenity"~"place_of_worship|temple"]',
        "police": 'node["amenity"="police"]',
        "bank": 'node["amenity"="bank"]',
        "pharmacy": 'node["amenity"="pharmacy"]',
        "market": 'node["shop"~"supermarket|mall"]',
        "bus_stop": 'node["highway"="bus_stop"]',
        "park": 'node["leisure"="park"]',
        "atm": 'node["amenity"="atm"]'
    }
    
    # If no specific type, search for a comprehensive set
    if place_type and place_type.lower() in TYPE_MAP:
        selector = f'{TYPE_MAP[place_type.lower()]}(around:{radius},{lat},{lng});'
    else:
        # Default: Multiple common amenities each with their own location filter
        selector = f"""
        node["amenity"~"school|hospital|place_of_worship|police|bank|pharmacy|atm"](around:{radius},{lat},{lng});
        node["leisure"="park"](around:{radius},{lat},{lng});
        node["shop"~"supermarket|mall"](around:{radius},{lat},{lng});
        """

    overpass_query = f"""
    [out:json][timeout:30];
    (
      {selector}
    );
    out body;
    >;
    out skel qt;
    """
    
    url = "https://overpass-api.de/api/interpreter"
    
    try:
        response = requests.post(url, data={"data": overpass_query}, timeout=30)
        if response.status_code != 200:
            return {"success": False, "error": f"Overpass API error: Status {response.status_code}"}
            
        try:
            data = response.json()
        except Exception:
            return {"success": False, "error": "Overpass API returned invalid data (possibly busy)."}
            
        results = []
        for element in data.get("elements", []):
            if element.get("type") == "node":
                tags = element.get("tags", {})
                results.append({
                    "name": tags.get("name") or tags.get("name:en") or f"Unnamed {place_type or 'POI'}",
                    "lat": element.get("lat"),
                    "lng": element.get("lon"),
                    "address": tags.get("addr:full") or tags.get("addr:street") or "Address not found",
                    "type": tags.get("amenity") or tags.get("shop") or tags.get("highway") or "Other",
                    "id": element.get("id")
                })
        
        return {"success": True, "results": results}
            
    except Exception as e:
        return {"success": False, "error": f"Search failed: {str(e)}"}

@frappe.whitelist()
def update_custom_attributes(project_id, custom_attributes):
    from frappe.modules.export_file import export_to_files
    role = _get_user_gis_role()
    if not role:
        frappe.throw("You do not have a GIS role assigned.")
        
    if isinstance(custom_attributes, str):
        custom_attributes = json.loads(custom_attributes)
        
    if isinstance(custom_attributes, dict):
        meta = frappe.get_meta("GIS Project")
        needs_export = False
        
        doctype_doc = frappe.get_doc("DocType", "GIS Project")
        for label, value in custom_attributes.items():
            fieldname = frappe.scrub(label)
            if not meta.has_field(fieldname):
                doctype_doc.append("fields", {
                    "fieldname": fieldname,
                    "label": label,
                    "fieldtype": "Data",
                    "insert_after": "remarks"
                })
                needs_export = True
                
        if needs_export:
            doctype_doc.save(ignore_permissions=True)
            export_to_files(record_list=[["DocType", "GIS Project"]])
            frappe.db.updatedb("GIS Project")
            frappe.db.commit()
            frappe.clear_cache(doctype="GIS Project")
            
        original_doc = frappe.get_doc("GIS Project", project_id)
        
        # If in Correction status, update the same project in-place so they can resubmit it
        if original_doc.status == "Correction":
            if original_doc.docstatus != 0:
                original_doc.db_set("docstatus", 0)
                original_doc.docstatus = 0
                frappe.db.commit()
            for label, value in custom_attributes.items():
                fieldname = frappe.scrub(label)
                original_doc.set(fieldname, value)
            original_doc.custom_attributes = json.dumps(custom_attributes)
            original_doc.save(ignore_permissions=True)
            frappe.cache().delete_keys("gis_projects_cache_")
            frappe.db.commit()
            return {"id": project_id, "updated": True}
            
        # Create a new record (duplicate) as requested
        new_doc = frappe.copy_doc(original_doc)
        new_doc.status = "Draft"
        
        for label, value in custom_attributes.items():
            fieldname = frappe.scrub(label)
            new_doc.set(fieldname, value)
            
        new_doc.custom_attributes = json.dumps(custom_attributes)
        new_doc.insert(ignore_permissions=True, ignore_mandatory=True)
        frappe.cache().delete_keys("gis_projects_cache_")
        frappe.db.commit()
        
        return {"id": new_doc.name, "updated": True}
    return {"id": project_id, "updated": False}

@frappe.whitelist()
def fix_options():
    dt = frappe.get_doc('DocType', 'GIS Project')
    for f in dt.fields:
        if f.fieldname == 'status':
            f.options = 'Draft\nSubmitted\nApproved\nRejected\nPending for Request'
    dt.save(ignore_permissions=True)
    frappe.db.commit()
    return "fixed"

@frappe.whitelist()
def submit_work_order():
    project_id = frappe.form_dict.get('project_id')
    comment = frappe.form_dict.get('comment')
    approver = frappe.form_dict.get('approver')
    file_doc = None
    
    if not project_id:
        frappe.throw("Project ID is required")
        
    # Create the Work Order first
    doc = frappe.get_doc({
        "doctype": "Initiate Work Order",
        "gis_project": project_id,
        "comment": comment,
        "approver": approver,
    })
    doc.insert(ignore_permissions=True)
    
    # Handle file upload if present
    if 'file' in frappe.request.files:
        from frappe.utils.file_manager import save_file
        uploaded_file = frappe.request.files['file']
        file_content = uploaded_file.read()
        file_name = uploaded_file.filename
        
        file_doc = save_file(
            file_name, 
            file_content, 
            "Initiate Work Order", 
            doc.name, 
            is_private=0,
            decode=False
        )
        
        # Update the attachment field in the document
        doc.db_set('attachment', file_doc.file_url)

    # Immediately update the linked GIS Project's status to 'Pending for Request' and color to Orange (#ea580c)
    if project_id:
        frappe.db.set_value("GIS Project", project_id, "status", "Pending for Request")
        frappe.db.set_value("GIS Project", project_id, "color", "#ea580c")
        frappe.cache().delete_keys("gis_projects_cache_")

    frappe.db.commit()
    
    return {"success": True, "id": doc.name}

@frappe.whitelist()
def get_pending_work_orders_count():
    user_roles = frappe.get_roles(frappe.session.user)
    
    role_status_map = {
        "Executive Engineer": "Pending for Request",
        "City Engineer": "Pending for Request",
        "Muncipal Commissioner": "Pending for Request",
        "GIS Junior Engineer": "Correction"
    }
    
    is_admin = "System Manager" in user_roles or frappe.session.user == "Administrator"
    matching_roles = [r for r in user_roles if r in role_status_map]
    if not is_admin and not matching_roles:
        return {"count": 0}
        
    active_projects = frappe.get_all(
        "GIS Project",
        filters={"status": ["in", ["Pending for Request", "Correction"]]},
        fields=["name", "status", "owner"],
        ignore_permissions=True
    )
    
    if not active_projects:
        return {"count": 0}
        
    count = 0
    for p in active_projects:
        latest_wo = frappe.get_all(
            "Initiate Work Order",
            filters={"gis_project": p.name},
            fields=["approver"],
            order_by="creation desc",
            limit=1,
            ignore_permissions=True
        )
        if latest_wo:
            wo_approver = latest_wo[0].get("approver")
            if is_admin:
                count += 1
            elif wo_approver in matching_roles:
                # Junior Engineers only get notified for corrections on their own created projects
                if wo_approver == "GIS Junior Engineer" and p.get("owner") != frappe.session.user:
                    continue
                expected_status = role_status_map.get(wo_approver)
                if expected_status == p.status:
                    count += 1
                    
    return {"count": count}


@frappe.whitelist()
def add_timeline_entry():
    project_id = frappe.form_dict.get('project_id')
    status = frappe.form_dict.get('status')
    date = frappe.form_dict.get('date')
    comment = frappe.form_dict.get('comment')
    
    if not project_id or not status:
        frappe.throw("Project ID and Status are required")
        
    doc = frappe.get_doc("GIS Project", project_id)
    
    file_url = None
    if 'file' in frappe.request.files:
        from frappe.utils.file_manager import save_file
        uploaded_file = frappe.request.files['file']
        file_content = uploaded_file.read()
        file_name = uploaded_file.filename
        
        file_doc = save_file(
            file_name, 
            file_content, 
            "GIS Project", 
            project_id, 
            is_private=0,
            decode=False
        )
        file_url = file_doc.file_url

    # Read existing timeline
    timeline_str = doc.get("timeline")
    timeline_list = []
    if timeline_str:
        try:
            timeline_list = json.loads(timeline_str)
        except Exception:
            pass
            
    # Append new entry
    from frappe.utils import now_datetime
    entry = {
        "status": status,
        "date": date,
        "comment": comment or "",
        "image": file_url or "",
        "created_at": str(now_datetime())
    }
    timeline_list.append(entry)
    
    # Map status to color
    COLOR_MAP = {
        "Approved": "#16a34a",
        "Work Started": "#3b82f6",
        "Ongoing": "#4f46e5",
        "Hold": "#ef4444",
        "Near Completion": "#06b6d4",
        "Completed": "#10b981",
    }
    color = COLOR_MAP.get(status, doc.color or "#16a34a")
    
    # Update fields via db_set
    doc.db_set("timeline", json.dumps(timeline_list))
    doc.db_set("status", status)
    doc.db_set("color", color)
    
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()
    
    return {"success": True, "id": project_id, "status": status, "color": color, "timeline": timeline_list}



