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

# Predefined colors for project types (used as default colors for manual uploads)
DEFAULT_COLORS = {
    "Chambers_Manhole": "#e74c3c",
    "Drainage": "#3498db",
    "Pipeline_Network": "#2ecc71",
    "Railway_Underpass": "#f39c12",
    "Raw_Water_Station": "#9b59b6",
    "Road": "#2c3e50",
    "Road_Bridge": "#1abc9c",
    "Road_Flyover": "#16a085",
    "Road_Underpass": "#d35400",
    "Sewage_Treatment_Plant": "#7f8c8d",
    "Sewer_Pipeline_Network": "#c0392b",
    "Sewerage_Collection_Point": "#2980b9",
    "Storage_Tank": "#27ae60",
    "Treatment_Plant": "#f1c40f",
    "Water_Source": "#8e44ad",
    "VVCM-ALL-ROAD": "#3b82f6",
    "VVCM_BOUNDARY": "#ef4444",
    "VVCM_OFFICE_BUILDING": "#1abc9c",
    "VVCM_VILLAGE BOUNDARY": "#f97316",
    "Prabhag_Ward_Boundary": "#9b59b6",
    "City_Boundary": "#c0392b",
    "DMA_Location": "#16a085"
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

    
    # Copy all other columns from database record if they exist in p
    p_dict = p
    if hasattr(p, "as_dict") and callable(p.as_dict):
        p_dict = p.as_dict()
    if isinstance(p_dict, dict):
        for k, v in p_dict.items():
            if k not in res and k not in ["geometry", "_user_tags", "_comments", "_assign", "_liked_by"]:
                res[k] = v

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
    # Handle string "true"/"false" from frontend
    if isinstance(omit_geometry, str):
        omit_geometry = omit_geometry.lower() == "true"

    if limit:
        limit = int(limit)

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

    # Build DB filters: reference layers are always fetched
    db_filters = None
    db_or_filters = None

    is_guest = frappe.session.user == "Guest"

    if status or is_guest:
        # Fetch reference layers OR regular projects matching the status/guest filter
        db_or_filters = [
            ["project_type", "like", "MBMC-%"],
            ["project_type", "like", "VVCM%"],
            ["project_type", "in", ["BUILDING_INFO", "building_info", "Road", "road"]]
        ]
        if status:
            if "," in status:
                db_or_filters.append(["status", "in", [s.strip() for s in status.split(",")]])
            else:
                db_or_filters.append(["status", "=", status])
        elif is_guest:
            # Guest sees approved projects
            db_or_filters.append(["status", "in", ["Approved", "Work Started", "Ongoing", "On Hold", "Hold", "Near Completion", "Completed"]])

    projects = frappe.get_all(
        "GIS Project",
        filters=db_filters,
        or_filters=db_or_filters,
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
        # Check if reference layer
        p_type = p.get("project_type")
        desc = p.get("description") or ""
        if "LAYER_TYPE:" in desc:
            try:
                p_type = desc.split("LAYER_TYPE:")[1].split(" |")[0].strip()
            except: pass
        
        is_ref = False
        if p_type:
            p_type_upper = p_type.upper()
            if p_type_upper.startswith("MBMC-") or p_type_upper.startswith("VVCM") or p_type_upper in ["BUILDING_INFO", "ROAD"]:
                is_ref = True

        if is_ref:
            filtered_projects.append(p)
            continue

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
    
    # System Manager Admin Override
    if user_role == "System Manager":
        doc.db_set("status", status)
        if status == "Approved":
            doc.db_set("color", "#16a34a")
            doc.db_set("docstatus", 1)
        elif status == "Rejected":
            doc.db_set("color", "#dc2626")
            doc.db_set("docstatus", 0)
        elif status == "Submitted":
            doc.db_set("color", "#ea580c")
            doc.db_set("docstatus", 0)
        elif status == "Correction":
            doc.db_set("color", "#e11d48")
            doc.db_set("docstatus", 0)
        else:
            doc.db_set("docstatus", 0)
            
        if status == "Correction":
            new_wo = frappe.get_doc({
                "doctype": "Initiate Work Order",
                "gis_project": project_id,
                "approver": "GIS Junior Engineer",
                "comment": comment or "Sent for Correction"
            })
            new_wo.insert(ignore_permissions=True)
            
        frappe.cache().delete_keys("gis_projects_cache_")
        frappe.db.commit()
        return {"id": project_id, "status": status}

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
    """Accept file upload, save to persistent temp dir, enqueue background processing."""
    if not frappe.request.files:
        return {"success": False, "error": "No file provided"}

    uploaded_file = frappe.request.files.get("file")
    if not uploaded_file:
        return {"success": False, "error": "Field 'file' missing"}

    role = _get_user_gis_role()
    if not role:
        frappe.throw("You do not have a GIS role assigned.")

    suffix = os.path.splitext(uploaded_file.filename)[1].lower()
    upload_dir = os.path.join(tempfile.gettempdir(), "frappe_gis_uploads")
    os.makedirs(upload_dir, exist_ok=True)

    import uuid
    job_id = str(uuid.uuid4())
    dest_path = os.path.join(upload_dir, f"{job_id}{suffix}")

    # Stream file to disk in 8 MB chunks — no RAM spike on web worker
    with open(dest_path, "wb") as f:
        uploaded_file.seek(0)
        chunk_size = 8 * 1024 * 1024
        while True:
            chunk = uploaded_file.read(chunk_size)
            if not chunk:
                break
            f.write(chunk)

    original_filename = uploaded_file.filename

    # Store initial job status so the frontend can poll
    frappe.cache().set_value(
        f"gis_upload_job_{job_id}",
        {"status": "queued", "message": "File saved. Processing will begin shortly.", "saved_count": 0},
        expires_in_sec=3600,
    )

    # Offload the heavy work to the background long-queue worker
    frappe.enqueue(
        "qgis.api.gis_project._process_gis_upload_job",
        queue="long",
        timeout=3600,
        job_id=job_id,
        upload_job_id=job_id,
        file_path=dest_path,
        suffix=suffix,
        original_filename=original_filename,
        ward=ward,
        project_type=project_type,
        role=role,
        site=frappe.local.site,
    )

    return {
        "success": True,
        "status": "queued",
        "job_id": job_id,
        "message": f"File '{original_filename}' uploaded. Processing in background…",
    }


def _process_gis_upload_job(
    upload_job_id, file_path, suffix, original_filename, ward, project_type, role, site
):
    """Background worker: parse GIS file and insert features into GIS Project DocType."""
    import frappe as _frappe
    import json as _json
    import os as _os
    import subprocess as _subprocess
    import shutil as _shutil
    import zipfile as _zipfile
    import tempfile as _tempfile

    def _set_status(status, message, saved_count=0, error=None):
        payload = {"status": status, "message": message, "saved_count": saved_count}
        if error:
            payload["error"] = error
        _frappe.cache().set_value(f"gis_upload_job_{upload_job_id}", payload, expires_in_sec=3600)

    def _flip(coords):
        if isinstance(coords[0], (int, float)):
            return [coords[1], coords[0]]
        return [_flip(c) for c in coords]

    _set_status("processing", "Extracting GIS data…")

    try:
        extract_dir = None
        files_to_process = []

        if suffix == ".zip":
            extract_dir = _tempfile.mkdtemp()
            with _zipfile.ZipFile(file_path, "r") as zr:
                zr.extractall(extract_dir)
            for root, dirs, files in _os.walk(extract_dir):
                for f in files:
                    if f.lower().endswith((".shp", ".geojson", ".kml", ".gpkg")) and not f.startswith("._"):
                        files_to_process.append(_os.path.join(root, f))
            if not files_to_process:
                if extract_dir:
                    _shutil.rmtree(extract_dir)
                _os.unlink(file_path)
                _set_status("error", "No valid GIS files found in zip.", error="No .shp/.geojson/.gpkg/.kml in zip")
                return
        else:
            path_to_read = f"/vsizip/{file_path}" if suffix in (".kmz", ".qgz") else file_path
            files_to_process = [path_to_read]

        saved_count = 0

        for fpath in files_to_process:
            ogrinfo_path = _shutil.which("ogrinfo") or "/usr/bin/ogrinfo"
            try:
                info_res = _subprocess.run([ogrinfo_path, "-ro", "-q", fpath], capture_output=True, text=True, check=True)
            except _subprocess.CalledProcessError:
                if suffix == ".qgz":
                    _set_status("error", "Cannot process .qgz file.", error=".qgz not supported")
                    if extract_dir: _shutil.rmtree(extract_dir)
                    _os.unlink(file_path)
                    return
                continue
            except FileNotFoundError:
                _set_status("error", "GDAL/ogrinfo not installed.", error="ogrinfo not found")
                if extract_dir: _shutil.rmtree(extract_dir)
                _os.unlink(file_path)
                return

            layer_names = []
            for line in info_res.stdout.splitlines():
                if ": " in line:
                    name = line.split(": ")[1].split(" (")[0].strip()
                    if name:
                        layer_names.append(name)
                elif line.startswith("1: "):
                    name = line.split("1: ")[1].split(" (")[0].strip()
                    if name:
                        layer_names.append(name)
            if not layer_names:
                layer_names = ["OGRGeoJSON"]

            for layer in layer_names:
                ogr2ogr_path = _shutil.which("ogr2ogr") or "/usr/bin/ogr2ogr"
                try:
                    out = _subprocess.run(
                        [ogr2ogr_path, "-f", "GeoJSON", "-t_srs", "EPSG:4326", "/vsistdout/", fpath, layer],
                        capture_output=True, text=True,
                    )
                    if not out.stdout.strip():
                        continue
                    geojson = _json.loads(out.stdout)
                except Exception as e:
                    _frappe.log_error(f"ogr2ogr failed for {layer}: {str(e)}", "GIS Error")
                    continue

                total_features = len(geojson.get("features", []))
                _set_status("processing", f"Inserting {total_features} features from layer '{layer}'…", saved_count)

                for feature in geojson.get("features", []):
                    geom = feature.get("geometry")
                    if not geom or "coordinates" not in geom:
                        continue

                    geom["coordinates"] = _flip(geom["coordinates"])
                    props = feature.get("properties", {}) or {}

                    p_name = props.get("name") or props.get("road_name") or f"{layer} Feature {saved_count + 1}"
                    if len(str(p_name)) > 140:
                        p_name = str(p_name)[:137] + "..."

                    final_type = layer
                    if final_type == "OGRGeoJSON" and suffix == ".zip":
                        final_type = _os.path.splitext(_os.path.basename(fpath))[0]

                    if _frappe.db.exists("DocType", "GIS Category"):
                        if not _frappe.db.exists("GIS Category", final_type):
                            is_fill = 0 if any(k in final_type.lower() for k in ("boundary", "road", "drain", "pipe")) else 1
                            weight_val = 4 if "boundary" in final_type.lower() else 1.5 if "village" in final_type.lower() else 2 if "road" in final_type.lower() else 3
                            cat_color = DEFAULT_COLORS.get(final_type) or DEFAULT_COLORS.get(layer) or "#1a73e8"
                            try:
                                _frappe.get_doc({
                                    "doctype": "GIS Category",
                                    "category_name": final_type,
                                    "color": cat_color,
                                    "fill": is_fill,
                                    "weight": weight_val,
                                }).insert(ignore_permissions=True)
                                _frappe.db.commit()
                            except Exception:
                                pass

                    project_color = None
                    if _frappe.db.exists("DocType", "GIS Category"):
                        project_color = _frappe.db.get_value("GIS Category", final_type, "color")
                    if not project_color:
                        project_color = DEFAULT_COLORS.get(final_type) or DEFAULT_COLORS.get(layer) or "#2563eb"

                    _frappe.get_doc({
                        "doctype": "GIS Project",
                        "project_name": p_name,
                        "ward": ward,
                        "project_type": final_type,
                        "status": "Draft",
                        "color": project_color,
                        "description": f"LAYER_TYPE:{layer} | Imported from {original_filename}",
                        "submitted_by_role": role,
                        "geometry": _json.dumps(geom),
                        "custom_attributes": _json.dumps(dict(props)),
                        "gis_id": props.get("GIS ID"),
                        "old_survey_no_hissa_no": props.get("Old Survey No_Hissa No") or props.get("Old Survey No / Hissa No"),
                        "new_survey_no_hissa_no": props.get("New Survey No_Hissa No") or props.get("New Survey No / Hissa No"),
                        "reservation_number": props.get("Reservation Number"),
                        "drc_no": props.get("DRC NO") or props.get("DRC No"),
                        "reservation_name": props.get("Reservation Name"),
                        "village_name": props.get("Village Name"),
                        "reservation_drawing_link": props.get("RESERVATION_DRAWING LINK") or props.get("RESERVATION_DRAWING_LINK"),
                        "land_acquired_status": props.get("LAND ACQUIRED STATUS") or props.get("LAND_ACQUIRED_STATUS"),
                        "mbmc_7_12": props.get("MBMC 7_12") or props.get("MBMC_7_12"),
                        "2019_format_czmp_affected_area": props.get("2019_FORMAT_CZMP_AFFECTED_AREA"),
                        "encroachment_status": props.get("ENCROACHMENT_STATUS"),
                        "encroachment_photos": props.get("ENCROACHMENT_PHOTOS"),
                        "encroachment_link": props.get("ENCROACHMENT_LINK"),
                        "area_name": props.get("area_name") or props.get("Area Name"),
                        "area_size": props.get("area_size") or props.get("Area Size"),
                        "yearly_rent": props.get("yearly_rent") or props.get("Yearly Rent"),
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
                        "fly_name": props.get("fly_name"),
                    }).insert(ignore_permissions=True, ignore_mandatory=True)
                    saved_count += 1

                    if saved_count % 100 == 0:
                        _frappe.db.commit()
                        _set_status("processing", f"Inserted {saved_count} features…", saved_count)

        _frappe.cache().delete_keys("gis_projects_cache_")
        _frappe.db.commit()

        try:
            _os.unlink(file_path)
        except Exception:
            pass
        if extract_dir:
            try:
                _shutil.rmtree(extract_dir)
            except Exception:
                pass

        _set_status("done", f"Successfully imported {saved_count} features.", saved_count)

    except Exception as e:
        _frappe.log_error(_frappe.get_traceback(), "GIS Upload Background Job Error")
        try:
            if _os.path.exists(file_path):
                _os.unlink(file_path)
        except Exception:
            pass
        _set_status("error", f"Processing failed: {str(e)}", error=str(e))


@frappe.whitelist()
def get_upload_job_status(job_id):
    """Poll background upload job status from the frontend."""
    data = frappe.cache().get_value(f"gis_upload_job_{job_id}")
    if not data:
        return {"status": "not_found", "message": "Job not found or expired."}
    return data

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
        # Filter out standard DocType fields and internal properties to prevent validation errors
        ignored_keys = {
            "name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", 
            "amended_from", "geometry", "_user_tags", "_comments", "_assign", "_liked_by",
            "timeline", "stages", "color", "status", "submitted_by_role", "wo_id", "wo_comment",
            "wo_attachment", "approver", "created_at", "id"
        }
        custom_attributes = {k: v for k, v in custom_attributes.items() if k not in ignored_keys and k.lower() not in ignored_keys}
        meta = frappe.get_meta("GIS Project")
        needs_clear_cache = False
        
        # Check if developer mode is enabled
        developer_mode = frappe.conf.get("developer_mode", 0)
        
        if developer_mode:
            doctype_doc = frappe.get_doc("DocType", "GIS Project")
            for label, value in custom_attributes.items():
                if label == "section_mappings":
                    continue
                fieldname = frappe.scrub(label)
                if not meta.has_field(fieldname):
                    doctype_doc.append("fields", {
                        "fieldname": fieldname,
                        "label": label,
                        "fieldtype": "Long Text" if fieldname in ["tenant_attachments", "pdf_attachment"] else "Data",
                        "insert_after": "remarks"
                    })
                    needs_clear_cache = True
            if needs_clear_cache:
                doctype_doc.save(ignore_permissions=True)
                export_to_files(record_list=[["DocType", "GIS Project"]])
                frappe.db.updatedb("GIS Project")
                frappe.db.commit()
                frappe.clear_cache(doctype="GIS Project")
        else:
            # In production, use Custom Field to avoid CannotCreateStandardDoctypeError
            for label, value in custom_attributes.items():
                if label == "section_mappings":
                    continue
                fieldname = frappe.scrub(label)
                if not meta.has_field(fieldname):
                    if not frappe.db.exists("Custom Field", {"dt": "GIS Project", "fieldname": fieldname}):
                        custom_field = frappe.new_doc("Custom Field")
                        custom_field.dt = "GIS Project"
                        custom_field.fieldname = fieldname
                        custom_field.label = label
                        custom_field.fieldtype = "Long Text" if fieldname in ["tenant_attachments", "pdf_attachment"] else "Data"
                        custom_field.insert_after = "remarks"
                        custom_field.insert(ignore_permissions=True)
                        needs_clear_cache = True
            if needs_clear_cache:
                frappe.clear_cache(doctype="GIS Project")
                frappe.db.commit()
            
        original_doc = frappe.get_doc("GIS Project", project_id)
        
        # Load existing custom attributes to merge new ones and preserve attachments
        existing_custom_attrs = {}
        if original_doc.custom_attributes:
            try:
                existing_custom_attrs = json.loads(original_doc.custom_attributes)
            except Exception:
                pass
                
        # Merge new attributes into existing ones
        for label, value in custom_attributes.items():
            existing_custom_attrs[label] = value

        # If in Draft or Correction status, update the same project in-place so they can resubmit it
        if original_doc.status in ["Draft", "Correction"]:
            if original_doc.docstatus != 0:
                original_doc.db_set("docstatus", 0)
                original_doc.docstatus = 0
                frappe.db.commit()
            for label, value in custom_attributes.items():
                if label == "section_mappings":
                    continue
                fieldname = frappe.scrub(label)
                val_to_set = json.dumps(value) if isinstance(value, (list, dict)) else value
                original_doc.set(fieldname, val_to_set)
            original_doc.custom_attributes = json.dumps(existing_custom_attrs)
            
            import time
            for attempt in range(5):
                try:
                    original_doc.save(ignore_permissions=True)
                    frappe.db.commit()
                    break
                except Exception as e:
                    if hasattr(e, 'args') and len(e.args) > 0 and e.args[0] == 1412:
                        time.sleep(0.5)
                        frappe.db.rollback()
                        original_doc.reload()
                        continue
                    raise e
                    
            frappe.cache().delete_keys("gis_projects_cache_")
            return {"id": project_id, "updated": True}
            
        # Create a new record (duplicate) as requested
        new_doc = frappe.copy_doc(original_doc)
        new_doc.status = "Draft"
        new_doc.docstatus = 0
        
        for label, value in custom_attributes.items():
            if label == "section_mappings":
                continue
            fieldname = frappe.scrub(label)
            val_to_set = json.dumps(value) if isinstance(value, (list, dict)) else value
            new_doc.set(fieldname, val_to_set)
            
        new_doc.custom_attributes = json.dumps(existing_custom_attrs)
        
        import time
        for attempt in range(5):
            try:
                new_doc.insert(ignore_permissions=True, ignore_mandatory=True)
                frappe.db.commit()
                break
            except Exception as e:
                if hasattr(e, 'args') and len(e.args) > 0 and e.args[0] == 1412:
                    time.sleep(0.5)
                    frappe.db.rollback()
                    continue
                raise e
                
        frappe.cache().delete_keys("gis_projects_cache_")
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
    
    description = frappe.form_dict.get('description')
    estimated_cost = frappe.form_dict.get('estimated_cost')
    estimated_duration = frappe.form_dict.get('estimated_duration')
    tentative_start_date = frappe.form_dict.get('tentative_start_date')
    
    file_doc = None
    
    if not project_id:
        frappe.throw("Project ID is required")
        
    # Format a clean, detailed summary to save in the workflow history comments
    summary_parts = []
    if description:
        summary_parts.append(f"Description: {description}")
    if estimated_cost:
        summary_parts.append(f"Estimated Cost: {estimated_cost}")
    if estimated_duration:
        summary_parts.append(f"Estimated Duration: {estimated_duration}")
    if tentative_start_date:
        summary_parts.append(f"Estimated Tentative Start Date: {tentative_start_date}")
        
    proposal_summary = "\n".join(summary_parts)
    full_comment = comment or ""
    if proposal_summary:
        if full_comment:
            full_comment = f"{full_comment}\n\n{proposal_summary}"
        else:
            full_comment = proposal_summary

    # Create the Work Order document
    doc = frappe.get_doc({
        "doctype": "Initiate Work Order",
        "gis_project": project_id,
        "comment": full_comment,
        "approver": approver,
        "description": description,
        "estimated_cost": estimated_cost,
        "estimated_duration": estimated_duration,
        "tentative_start_date": tentative_start_date,
    })
    
    import time
    for attempt in range(5):
        try:
            doc.insert(ignore_permissions=True)
            frappe.db.commit()
            break
        except Exception as e:
            if hasattr(e, 'args') and len(e.args) > 0 and e.args[0] == 1412:
                time.sleep(0.5)
                frappe.db.rollback()
                continue
            raise e
    
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

    # Update the linked GIS Project's status, color, and proposal metadata fields
    if project_id:
        import json
        for attempt in range(5):
            try:
                proj_doc = frappe.get_doc("GIS Project", project_id)
                proj_doc.status = "Pending for Request"
                proj_doc.color = "#ea580c"
                
                if description:
                    proj_doc.description = description
                if estimated_cost:
                    proj_doc.budget = estimated_cost
                if tentative_start_date:
                    proj_doc.start_date = tentative_start_date
                    
                # Update custom_attributes with duration
                attrs = {}
                if proj_doc.custom_attributes:
                    try:
                        attrs = json.loads(proj_doc.custom_attributes) or {}
                    except Exception:
                        pass
                if estimated_duration:
                    attrs['Estimated Duration'] = estimated_duration
                    proj_doc.custom_attributes = json.dumps(attrs)
                    
                proj_doc.save(ignore_permissions=True)
                frappe.db.commit()
                break
            except Exception as e:
                if hasattr(e, 'args') and len(e.args) > 0 and e.args[0] == 1412:
                    time.sleep(0.5)
                    frappe.db.rollback()
                    continue
                raise e

        frappe.cache().delete_keys("gis_projects_cache_")

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
    existing_images_str = frappe.form_dict.get('existing_images') or '[]'
    
    if not project_id or not status:
        frappe.throw("Project ID and Status are required")
        
    doc = frappe.get_doc("GIS Project", project_id)
    
    # Process newly uploaded files
    file_urls = []
    if 'file' in frappe.request.files:
        from frappe.utils.file_manager import save_file
        # Get all files uploaded under 'file' key
        files_list = frappe.request.files.getlist('file')
        for uploaded_file in files_list:
            file_content = uploaded_file.read()
            file_name = uploaded_file.filename
            if file_content:
                file_doc = save_file(
                    file_name, 
                    file_content, 
                    "GIS Project", 
                    project_id, 
                    is_private=0,
                    decode=False
                )
                file_urls.append(file_doc.file_url)

    # Process existing images that the user decided to keep
    try:
        images_list = json.loads(existing_images_str)
    except Exception:
        images_list = []
        
    # Combine existing and new images
    images_list.extend(file_urls)

    # Read existing timeline
    timeline_str = doc.get("timeline")
    timeline_list = []
    if timeline_str:
        try:
            timeline_list = json.loads(timeline_str)
        except Exception:
            pass
            
    # Find and update or append entry
    from frappe.utils import now_datetime
    updated = False
    for entry in timeline_list:
        if entry.get("status") == status:
            entry["date"] = date
            entry["comment"] = comment or ""
            entry["images"] = images_list
            entry["image"] = images_list[0] if images_list else ""
            entry["created_at"] = str(now_datetime())
            updated = True
            break
            
    if not updated:
        entry = {
            "status": status,
            "date": date,
            "comment": comment or "",
            "image": images_list[0] if images_list else "",
            "images": images_list,
            "created_at": str(now_datetime())
        }
        timeline_list.append(entry)
    
    # Map status to color
    COLOR_MAP = {
        "Approved": "#16a34a",
        "Work Started": "#16a34a",
        "Ongoing": "#16a34a",
        "On Hold": "#16a34a",
        "Hold": "#16a34a",
        "Near Completion": "#16a34a",
        "Completed": "#14532d",
    }
    color = COLOR_MAP.get(status, doc.color or "#16a34a")
    
    # Update fields via db_set
    doc.db_set("timeline", json.dumps(timeline_list))
    doc.db_set("status", status)
    doc.db_set("color", color)
    
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()
    
    return {"success": True, "id": project_id, "status": status, "color": color, "timeline": timeline_list}


@frappe.whitelist(allow_guest=True)
def get_categories():
    if not frappe.db.exists("DocType", "GIS Category"):
        return [
            {
                "name": k,
                "category_name": k,
                "color": v,
                "fill": 0 if "boundary" in k.lower() or "road" in k.lower() or "drainage" in k.lower() or "pipeline" in k.lower() else 1,
                "weight": 4 if "boundary" in k.lower() else 2 if "village" in k.lower() or "manhole" in k.lower() else 3
            }
            for k, v in DEFAULT_COLORS.items()
        ]
    return frappe.get_all("GIS Category", fields=["name", "category_name", "color", "fill", "weight"], order_by="category_name asc")


@frappe.whitelist()
def create_category(category_name, color="#1a73e8", fill=1, weight=3):
    if not category_name:
        frappe.throw("Category name is required")
        
    fill_val = 1 if int(fill) else 0
    
    if not frappe.db.exists("GIS Category", category_name):
        doc = frappe.get_doc({
            "doctype": "GIS Category",
            "category_name": category_name,
            "color": color,
            "fill": fill_val,
            "weight": int(weight)
        })
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        frappe.cache().delete_keys("gis_projects_cache_")
        return {"success": True, "category": doc.name}
    return {"success": False, "error": "Category already exists"}


@frappe.whitelist()
def upload_project_pdf():
    # We can get files using:
    uploaded_files = frappe.request.files.getlist("files") or frappe.request.files.getlist("file")
    if not uploaded_files:
        if frappe.request.files.get("file"):
            uploaded_files = [frappe.request.files.get("file")]
        elif frappe.request.files.get("files"):
            uploaded_files = [frappe.request.files.get("files")]
            
    if not uploaded_files:
        frappe.throw("No files uploaded")
        
    project_id = frappe.form_dict.get("project_id")
    if not project_id:
        frappe.throw("Project ID is required")
        
    from frappe.utils.file_manager import save_file
    
    saved_attachments = []
    
    for uploaded_file in uploaded_files:
        file_doc = save_file(
            fname=uploaded_file.filename,
            content=uploaded_file.read(),
            dt="GIS Project",
            dn=project_id,
            is_private=0
        )
        saved_attachments.append({
            "name": uploaded_file.filename,
            "url": file_doc.file_url
        })
        
    doc = frappe.get_doc("GIS Project", project_id)
    
    custom_attrs = {}
    if doc.custom_attributes:
        try:
            custom_attrs = json.loads(doc.custom_attributes)
        except Exception:
            pass
            
    # Load existing attachments
    existing = custom_attrs.get("pdf_attachment")
    attachments_list = []
    
    if existing:
        if isinstance(existing, list):
            attachments_list = existing
        elif isinstance(existing, str):
            try:
                parsed = json.loads(existing)
                if isinstance(parsed, list):
                    attachments_list = parsed
                else:
                    attachments_list = [{"name": existing.split('/')[-1], "url": existing}]
            except:
                attachments_list = [{"name": existing.split('/')[-1], "url": existing}]
                
    # Add newly saved attachments
    attachments_list.extend(saved_attachments)
    
    custom_attrs["pdf_attachment"] = attachments_list
    doc.custom_attributes = json.dumps(custom_attrs)
    
    meta = frappe.get_meta("GIS Project")
    if meta.has_field("pdf_attachment") or frappe.db.exists("Custom Field", {"dt": "GIS Project", "fieldname": "pdf_attachment"}):
        doc.set("pdf_attachment", json.dumps(attachments_list))
        
    if doc.docstatus == 1:
        doc.db_set("custom_attributes", doc.custom_attributes)
        if meta.has_field("pdf_attachment"):
            doc.db_set("pdf_attachment", json.dumps(attachments_list))
    else:
        doc.save(ignore_permissions=True)
        
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()
    
    return {"attachments": attachments_list}


@frappe.whitelist()
def remove_project_attachment(project_id, file_url):
    if not project_id:
        frappe.throw("Project ID is required")
    if not file_url:
        frappe.throw("File URL is required")
        
    doc = frappe.get_doc("GIS Project", project_id)
    
    custom_attrs = {}
    if doc.custom_attributes:
        try:
            custom_attrs = json.loads(doc.custom_attributes)
        except Exception:
            pass
            
    existing = custom_attrs.get("pdf_attachment")
    attachments_list = []
    
    if existing:
        if isinstance(existing, list):
            attachments_list = existing
        elif isinstance(existing, str):
            try:
                parsed = json.loads(existing)
                if isinstance(parsed, list):
                    attachments_list = parsed
                else:
                    attachments_list = [{"name": existing.split('/')[-1], "url": existing}]
            except:
                attachments_list = [{"name": existing.split('/')[-1], "url": existing}]
                
    # Filter out the matching file_url
    new_list = [att for att in attachments_list if att.get("url") != file_url]
    
    if not new_list:
        if "pdf_attachment" in custom_attrs:
            del custom_attrs["pdf_attachment"]
    else:
        custom_attrs["pdf_attachment"] = new_list
        
    doc.custom_attributes = json.dumps(custom_attrs)
    
    meta = frappe.get_meta("GIS Project")
    if meta.has_field("pdf_attachment") or frappe.db.exists("Custom Field", {"dt": "GIS Project", "fieldname": "pdf_attachment"}):
        doc.set("pdf_attachment", json.dumps(new_list) if new_list else None)
        
    if doc.docstatus == 1:
        doc.db_set("custom_attributes", doc.custom_attributes)
        if meta.has_field("pdf_attachment"):
            doc.db_set("pdf_attachment", json.dumps(new_list) if new_list else None)
    else:
        doc.save(ignore_permissions=True)
        
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()
    
    return {"success": True}


@frappe.whitelist()
def upload_tenant_attachments():
    uploaded_files = frappe.request.files.getlist("files") or frappe.request.files.getlist("file")
    if not uploaded_files:
        if frappe.request.files.get("file"):
            uploaded_files = [frappe.request.files.get("file")]
        elif frappe.request.files.get("files"):
            uploaded_files = [frappe.request.files.get("files")]
            
    if not uploaded_files:
        frappe.throw("No files uploaded")
        
    project_id = frappe.form_dict.get("project_id")
    if not project_id:
        frappe.throw("Project ID is required")
        
    from frappe.utils.file_manager import save_file
    
    saved_attachments = []
    for uploaded_file in uploaded_files:
        file_doc = save_file(
            fname=uploaded_file.filename,
            content=uploaded_file.read(),
            dt="GIS Project",
            dn=project_id,
            is_private=0
        )
        saved_attachments.append({
            "name": uploaded_file.filename,
            "url": file_doc.file_url
        })
        
    doc = frappe.get_doc("GIS Project", project_id)
    custom_attrs = {}
    if doc.custom_attributes:
        try:
            custom_attrs = json.loads(doc.custom_attributes)
        except Exception:
            pass
            
    existing = custom_attrs.get("tenant_attachments")
    attachments_list = []
    if existing:
        if isinstance(existing, list):
            attachments_list = existing
        elif isinstance(existing, str):
            try:
                parsed = json.loads(existing)
                if isinstance(parsed, list):
                    attachments_list = parsed
                else:
                    attachments_list = [{"name": existing.split('/')[-1], "url": existing}]
            except:
                attachments_list = [{"name": existing.split('/')[-1], "url": existing}]
                
    attachments_list.extend(saved_attachments)
    custom_attrs["tenant_attachments"] = attachments_list
    doc.custom_attributes = json.dumps(custom_attrs)
    
    meta = frappe.get_meta("GIS Project")
    if meta.has_field("tenant_attachments") or frappe.db.exists("Custom Field", {"dt": "GIS Project", "fieldname": "tenant_attachments"}):
        doc.set("tenant_attachments", json.dumps(attachments_list))
        
    if doc.docstatus == 1:
        doc.db_set("custom_attributes", doc.custom_attributes)
        if meta.has_field("tenant_attachments"):
            doc.db_set("tenant_attachments", json.dumps(attachments_list))
    else:
        doc.save(ignore_permissions=True)
        
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()
    return {"attachments": attachments_list}


@frappe.whitelist()
def remove_tenant_attachment(project_id, file_url):
    if not project_id:
        frappe.throw("Project ID is required")
    if not file_url:
        frappe.throw("File URL is required")
        
    doc = frappe.get_doc("GIS Project", project_id)
    custom_attrs = {}
    if doc.custom_attributes:
        try:
            custom_attrs = json.loads(doc.custom_attributes)
        except Exception:
            pass
            
    existing = custom_attrs.get("tenant_attachments")
    attachments_list = []
    if existing:
        if isinstance(existing, list):
            attachments_list = existing
        elif isinstance(existing, str):
            try:
                parsed = json.loads(existing)
                if isinstance(parsed, list):
                    attachments_list = parsed
                else:
                    attachments_list = [{"name": existing.split('/')[-1], "url": existing}]
            except:
                attachments_list = [{"name": existing.split('/')[-1], "url": existing}]
                
    new_list = [att for att in attachments_list if att.get("url") != file_url]
    if not new_list:
        if "tenant_attachments" in custom_attrs:
            del custom_attrs["tenant_attachments"]
    else:
        custom_attrs["tenant_attachments"] = new_list
        
    doc.custom_attributes = json.dumps(custom_attrs)
    meta = frappe.get_meta("GIS Project")
    if meta.has_field("tenant_attachments") or frappe.db.exists("Custom Field", {"dt": "GIS Project", "fieldname": "tenant_attachments"}):
        doc.set("tenant_attachments", json.dumps(new_list) if new_list else None)
        
    if doc.docstatus == 1:
        doc.db_set("custom_attributes", doc.custom_attributes)
        if meta.has_field("tenant_attachments"):
            doc.db_set("tenant_attachments", json.dumps(new_list) if new_list else None)
    else:
        doc.save(ignore_permissions=True)
        
    frappe.cache().delete_keys("gis_projects_cache_")
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist(allow_guest=True)
def check_files_exist(paths=None):
    if paths is None:
        paths = frappe.form_dict.get("paths")
        
    if paths is None:
        return {}
        
    import json
    if isinstance(paths, str):
        try:
            paths = json.loads(paths)
        except Exception:
            paths = [paths]
            
    if not isinstance(paths, (list, tuple)):
        paths = [paths]
            
    import os
    from frappe.utils import get_site_path
    
    downloads_dir = "/Users/shyamkumarpandey/Downloads/MIRABHAINDAR MUNICIPAL CORPORATION RESERVATATION WORK 2023"
    public_files_dir = get_site_path("public", "files")
    
    results = {}
    for path in paths:
        if not path or not isinstance(path, str):
            continue
            
        clean_path = path
        if clean_path.startswith("/files/"):
          clean_path = clean_path[7:]
        elif clean_path.startswith("files/"):
          clean_path = clean_path[6:]
        elif clean_path.startswith("/mbmc_docs/"):
          clean_path = clean_path[11:]
        elif clean_path.startswith("mbmc_docs/"):
          clean_path = clean_path[10:]
        elif clean_path.startswith("/"):
          clean_path = clean_path[1:]
            
        clean_path = clean_path.replace("\\", "/")
        
        full_public_path = os.path.normpath(os.path.join(public_files_dir, clean_path))
        full_downloads_path = os.path.normpath(os.path.join(downloads_dir, clean_path))
        
        exists = os.path.exists(full_public_path) or os.path.exists(full_downloads_path)
        results[path] = exists
        
    return results


def ensure_property_survey_doctype():
    if not frappe.db.exists("DocType", "Property Survey"):
        try:
            doc = frappe.get_doc({
                "doctype": "DocType",
                "name": "Property Survey",
                "module": "qgis",
                "custom": 1,
                "autoname": "PROP-.####",
                "fields": [
                    {"fieldname": "property_id", "label": "Property ID", "fieldtype": "Data"},
                    {"fieldname": "category", "label": "Category", "fieldtype": "Data"},
                    {"fieldname": "property_type", "label": "Property Type", "fieldtype": "Data"},
                    {"fieldname": "plot_area", "label": "Plot Area", "fieldtype": "Data"},
                    {"fieldname": "constructed_area", "label": "Constructed Area", "fieldtype": "Data"},
                    {"fieldname": "carpet_area", "label": "Carpet Area", "fieldtype": "Data"},
                    {"fieldname": "existing_usage", "label": "Existing Usage", "fieldtype": "Data"},
                    {"fieldname": "address", "label": "Address", "fieldtype": "Text"},
                    {"fieldname": "geo_location", "label": "Geo Location", "fieldtype": "Long Text"},
                    {"fieldname": "tenant_name", "label": "Tenant Name", "fieldtype": "Data"},
                    {"fieldname": "contact", "label": "Contact", "fieldtype": "Data"},
                    {"fieldname": "rental_period", "label": "Rental Period", "fieldtype": "Data"},
                    {"fieldname": "documents", "label": "Documents", "fieldtype": "Data"},
                    {"fieldname": "status", "label": "Status", "fieldtype": "Select", "options": "Draft\nSubmitted"}
                ],
                "permissions": [
                    {
                        "role": "System Manager",
                        "read": 1, "write": 1, "create": 1, "delete": 1
                    }
                ]
            })
            doc.insert(ignore_permissions=True)
            frappe.db.commit()
        except Exception as e:
            frappe.log_error(f"Failed to create custom DocType Property Survey: {str(e)}")
    else:
        has_category = frappe.db.exists("DocField", {"parent": "Property Survey", "fieldname": "category"}) or frappe.db.exists("Custom Field", {"dt": "Property Survey", "fieldname": "category"})
        if not has_category:
            try:
                frappe.get_doc({
                    "doctype": "Custom Field",
                    "dt": "Property Survey",
                    "fieldname": "category",
                    "label": "Category",
                    "fieldtype": "Data",
                    "insert_after": "property_type"
                }).insert(ignore_permissions=True)
                frappe.db.commit()
            except Exception as e:
                frappe.log_error(title="Prop Survey add category custom field err", message=str(e))
        
        has_property_id = frappe.db.exists("DocField", {"parent": "Property Survey", "fieldname": "property_id"}) or frappe.db.exists("Custom Field", {"dt": "Property Survey", "fieldname": "property_id"})
        if not has_property_id:
            try:
                frappe.get_doc({
                    "doctype": "Custom Field",
                    "dt": "Property Survey",
                    "fieldname": "property_id",
                    "label": "Property ID",
                    "fieldtype": "Data",
                    "insert_after": "name"
                }).insert(ignore_permissions=True)
                frappe.db.commit()
            except Exception as e:
                frappe.log_error(title="Prop Survey add property_id custom field err", message=str(e))

@frappe.whitelist(allow_guest=True)
def save_property_survey(**kwargs):
    data = kwargs.get("data")
    if not data:
        data = frappe.form_dict.get("data")
    if not data and hasattr(frappe, "request"):
        if hasattr(frappe.request, "get_json"):
            try:
                req_json = frappe.request.get_json()
                if req_json and "data" in req_json:
                    data = req_json["data"]
                else:
                    data = req_json
            except Exception:
                pass

    if isinstance(data, str):
        import json
        try:
            data = json.loads(data)
        except Exception:
            data = None
            
    if not data or not isinstance(data, dict):
        frappe.throw("Invalid or missing survey data payload")
        
    ensure_property_survey_doctype()
    
    survey_name = frappe.db.get_value("Property Survey", {"name": data.get("name")}) if data.get("name") else None
    
    if survey_name:
        doc = frappe.get_doc("Property Survey", survey_name)
        doc.update({
            "property_id": data.get("property_id"),
            "category": data.get("category"),
            "property_type": data.get("property_type"),
            "plot_area": data.get("plot_area"),
            "constructed_area": data.get("constructed_area"),
            "carpet_area": data.get("carpet_area"),
            "existing_usage": data.get("existing_usage"),
            "address": data.get("address"),
            "geo_location": data.get("geo_location"),
            "tenant_name": data.get("tenant_name"),
            "contact": data.get("contact"),
            "rental_period": data.get("rental_period"),
            "documents": data.get("documents"),
            "status": data.get("status", "Draft")
        })
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc({
            "doctype": "Property Survey",
            "property_id": data.get("property_id"),
            "category": data.get("category"),
            "property_type": data.get("property_type"),
            "plot_area": data.get("plot_area"),
            "constructed_area": data.get("constructed_area"),
            "carpet_area": data.get("carpet_area"),
            "existing_usage": data.get("existing_usage"),
            "address": data.get("address"),
            "geo_location": data.get("geo_location"),
            "tenant_name": data.get("tenant_name"),
            "contact": data.get("contact"),
            "rental_period": data.get("rental_period"),
            "documents": data.get("documents"),
            "status": data.get("status", "Draft")
        })
        doc.insert(ignore_permissions=True)
        
    frappe.db.commit()
    return {"status": "success", "message": f"Survey saved as {doc.status} successfully!", "name": doc.name}

def ensure_user_custom_fields():
    if not frappe.db.exists("Custom Field", {"dt": "User", "fieldname": "custom_ward"}):
        try:
            frappe.get_doc({
                "doctype": "Custom Field",
                "dt": "User",
                "fieldname": "custom_ward",
                "label": "Ward / Access Level",
                "fieldtype": "Data",
                "insert_after": "email"
            }).insert(ignore_permissions=True)
            frappe.db.commit()
        except Exception as e:
            frappe.log_error(f"Failed to create custom field for User: {str(e)}")


@frappe.whitelist()
def get_gis_users_and_roles():
    ensure_user_custom_fields()
    
    # Fetch all system users
    users_data = frappe.db.get_all(
        "User",
        filters={"user_type": "System User", "name": ["not in", ["Administrator", "Guest"]]},
        fields=["name", "email", "first_name", "last_name", "enabled", "custom_ward"]
    )
    
    users = []
    for u in users_data:
        # Get all roles assigned to this user
        roles = [r.role for r in frappe.get_all("Has Role", filters={"parent": u.name}, fields=["role"])]
        
        users.append({
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "name": f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email,
            "roles": roles, # Array of roles!
            "ward_access": u.custom_ward or "All Wards",
            "enabled": u.enabled
        })
        
    # Get all active roles from database
    roles_data = frappe.db.get_all("Role", filters={"disabled": 0}, fields=["name"], order_by="name")
    all_roles = [r.name for r in roles_data]
    
    # Calculate user counts per role
    role_counts = {}
    for r in all_roles:
        role_counts[r] = 0
    for u in users:
        for r in u["roles"]:
            if r in role_counts:
                role_counts[r] += 1
                
    # Get actual Custom DocPerm permissions for all roles
    permissions = {}
    
    matrix_mapping = {
        "view_map": ("GIS Project", "read"),
        "upload_layer": ("GIS Project", "create"),
        "edit_attributes": ("GIS Project", "write"),
        "create_proposal": ("Initiate Work Order", "create"),
        "approve_request": ("Initiate Work Order", "submit"),
        "generate_work_order": ("Initiate Work Order", "write"),
        "manage_users": ("User", "write")
    }
    
    for r in all_roles:
        permissions[r] = {}
        for key, (doctype, perm_field) in matrix_mapping.items():
            permissions[r][key] = bool(frappe.db.get_value("Custom DocPerm", {"parent": doctype, "role": r}, perm_field))
            
    return {
        "users": users,
        "all_roles": all_roles,
        "role_counts": role_counts,
        "permissions": permissions
    }


@frappe.whitelist()
def create_gis_user(email, first_name, roles, ward_access, password, last_name=None):
    ensure_user_custom_fields()
    
    if frappe.db.exists("User", email):
        frappe.throw(f"User with email {email} already exists.")
        
    if isinstance(roles, str):
        if roles.startswith("["):
            roles = json.loads(roles)
        else:
            roles = [roles]
            
    user = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "send_welcome_email": 0,
        "user_type": "System User",
        "custom_ward": ward_access,
        "roles": [{"role": r} for r in roles]
    })
    
    if not any(r["role"] == "All" for r in user.roles):
        user.append("roles", {"role": "All"})
        
    user.insert(ignore_permissions=True)
    
    # Set password
    from frappe.utils.password import update_password
    update_password(email, password)
    
    return {"success": True, "message": "User created successfully"}


@frappe.whitelist()
def update_gis_user(email, first_name, roles, ward_access, enabled, last_name=None):
    if not frappe.db.exists("User", email):
        frappe.throw(f"User {email} not found.")
        
    if isinstance(roles, str):
        if roles.startswith("["):
            roles = json.loads(roles)
        else:
            roles = [roles]
            
    user = frappe.get_doc("User", email)
    user.first_name = first_name
    user.last_name = last_name
    user.custom_ward = ward_access
    user.enabled = int(enabled)
    
    user.set("roles", [{"role": r} for r in roles])
    if not any(r["role"] == "All" for r in user.roles):
        user.append("roles", {"role": "All"})
        
    user.save(ignore_permissions=True)
    frappe.db.commit()
    
    return {"success": True}


@frappe.whitelist()
def delete_gis_user(email):
    if not frappe.db.exists("User", email):
        frappe.throw(f"User {email} not found.")
    frappe.delete_doc("User", email, ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def update_gis_role_permissions(permissions):
    if isinstance(permissions, str):
        permissions = json.loads(permissions)
        
    matrix_mapping = {
        "view_map": ("GIS Project", "read"),
        "upload_layer": ("GIS Project", "create"),
        "edit_attributes": ("GIS Project", "write"),
        "create_proposal": ("Initiate Work Order", "create"),
        "approve_request": ("Initiate Work Order", "submit"),
        "generate_work_order": ("Initiate Work Order", "write"),
        "manage_users": ("User", "write")
    }
    
    for r_backend in permissions:
        for key, val in permissions[r_backend].items():
            if key in matrix_mapping:
                doctype, perm_field = matrix_mapping[key]
                set_doctype_perm_value(doctype, r_backend, perm_field, val)
                    
    frappe.clear_cache()
    return {"success": True}


def set_doctype_perm_value(doctype, role, perm_field, value):
    name = frappe.db.get_value("Custom DocPerm", {"parent": doctype, "role": role})
    int_value = 1 if value else 0
    if name:
        frappe.db.set_value("Custom DocPerm", name, perm_field, int_value)
    else:
        idx = frappe.db.count("Custom DocPerm", {"parent": doctype})
        doc = frappe.get_doc({
            "doctype": "Custom DocPerm",
            "parent": doctype,
            "parenttype": "DocType",
            "parentfield": "permissions",
            "role": role,
            "idx": idx,
            perm_field: int_value
        })
        doc.insert(ignore_permissions=True)
    frappe.db.commit()


@frappe.whitelist()
def create_gis_role(role_name):
    if not role_name:
        frappe.throw("Role name is required.")
        
    if frappe.db.exists("Role", role_name):
        frappe.throw(f"Role {role_name} already exists.")
        
    doc = frappe.get_doc({
        "doctype": "Role",
        "role_name": role_name
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    
    return {"success": True, "message": f"Role {role_name} created successfully"}


@frappe.whitelist()
def get_user_permissions(user):
    permissions = frappe.db.get_all(
        "User Permission",
        filters={"user": user},
        fields=["name", "allow", "for_value", "applicable_for"]
    )
    return permissions


@frappe.whitelist()
def add_user_permission(user, allow, for_value):
    if not frappe.db.exists("User", user):
        frappe.throw(f"User {user} does not exist.")
    
    # Check if already exists
    if frappe.db.exists("User Permission", {"user": user, "allow": allow, "for_value": for_value}):
        return {"success": True, "message": "Permission already exists."}
        
    doc = frappe.get_doc({
        "doctype": "User Permission",
        "user": user,
        "allow": allow,
        "for_value": for_value,
        "apply_to_all_doctypes": 1
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def delete_user_permission(name):
    if not frappe.db.exists("User Permission", name):
        frappe.throw("User permission record not found.")
    frappe.delete_doc("User Permission", name, ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist(allow_guest=True)
def get_csrf_token_api():
    import frappe.sessions
    return frappe.sessions.get_csrf_token()


@frappe.whitelist(allow_guest=True)
def get_property_surveys():
    ensure_property_survey_doctype()
    surveys = frappe.get_all("Property Survey", fields=["*"], order_by="creation desc")
    return {"status": "success", "data": surveys}


def ensure_register_tenant_doctype():
    if not frappe.db.exists("DocType", "Register Tenant"):
        try:
            doc = frappe.get_doc({
                "doctype": "DocType",
                "name": "Register Tenant",
                "module": "QGIS",
                "custom": 1,
                "autoname": "TENANT-.#####",
                "fields": [
                    {"fieldname": "tenant_name", "label": "Tenant Name", "fieldtype": "Data", "reqd": 1},
                    {"fieldname": "profession", "label": "Profession", "fieldtype": "Data"},
                    {"fieldname": "purpose_of_use", "label": "Purpose of Use", "fieldtype": "Data"},
                    {"fieldname": "contact_information", "label": "Contact Information", "fieldtype": "Data"},
                    {"fieldname": "rental_period", "label": "Rental Period", "fieldtype": "Data"},
                    {"fieldname": "aadhar_number", "label": "Aadhar Number", "fieldtype": "Data"},
                    {"fieldname": "gst_number", "label": "GST Number", "fieldtype": "Data"},
                    {"fieldname": "pan_card_number", "label": "PAN Card Number", "fieldtype": "Data"},
                    {"fieldname": "rent_amount", "label": "Rent Amount", "fieldtype": "Currency"},
                    {"fieldname": "renewal_date", "label": "Renewal Date", "fieldtype": "Data"},
                    {"fieldname": "property_id", "label": "Property ID", "fieldtype": "Data"},
                    {"fieldname": "status", "label": "Status", "fieldtype": "Select", "options": "Draft\nActive\nInactive", "default": "Draft"},
                    {"fieldname": "attachments", "label": "Attachments", "fieldtype": "Code", "options": "JSON"}
                ],
                "permissions": [
                    {
                        "role": "System Manager",
                        "read": 1, "write": 1, "create": 1, "delete": 1
                    }
                ]
            })
            doc.insert(ignore_permissions=True)
            frappe.db.commit()
        except Exception as e:
            frappe.log_error(f"Error creating Register Tenant DocType: {str(e)}")


@frappe.whitelist()
def register_tenant():
    import json
    ensure_register_tenant_doctype()
    data = frappe.local.form_dict
    if not data:
        data = frappe.parse_json(frappe.request.data)
        
    tenant_name = data.get("tenant_name")
    if not tenant_name:
        frappe.throw("Tenant Name is required")
        
    doc = frappe.get_doc({
        "doctype": "Register Tenant",
        "tenant_name": tenant_name,
        "profession": data.get("profession"),
        "purpose_of_use": data.get("purpose_of_use"),
        "contact_information": data.get("contact_information"),
        "rental_period": data.get("rental_period"),
        "aadhar_number": data.get("aadhar_number"),
        "gst_number": data.get("gst_number"),
        "pan_card_number": data.get("pan_card_number"),
        "rent_amount": data.get("rent_amount"),
        "renewal_date": data.get("renewal_date"),
        "property_id": data.get("property_id"),
        "status": data.get("status") or "Active",
        "attachments": data.get("attachments")
    })
    doc.insert()
    
    # Update active tenant details on GIS Project (both column if exists and custom_attributes)
    property_id = data.get("property_id")
    if property_id and frappe.db.exists("GIS Project", property_id):
        p_doc = frappe.get_doc("GIS Project", property_id)
        
        custom_attrs = {}
        if p_doc.custom_attributes:
            try:
                custom_attrs = frappe.parse_json(p_doc.custom_attributes) or {}
            except Exception:
                pass
        custom_attrs["tenant_name"] = tenant_name
        p_doc.custom_attributes = json.dumps(custom_attrs)
        
        meta = frappe.get_meta("GIS Project")
        if meta.has_field("tenant_name"):
            p_doc.tenant_name = tenant_name
        p_doc.save(ignore_permissions=True)
        
    frappe.db.commit()
    return {"status": "success", "message": "Tenant registered successfully", "name": doc.name}


@frappe.whitelist(allow_guest=False)
def get_registered_tenants(property_id=None):
    ensure_register_tenant_doctype()
    # When called via api.js call() helper, params come as JSON body
    if not property_id:
        try:
            body = frappe.parse_json(frappe.request.data) or {}
            property_id = body.get("property_id") or frappe.local.form_dict.get("property_id")
        except Exception:
            property_id = frappe.local.form_dict.get("property_id")
    if not property_id:
        return []
    tenants = frappe.get_all(
        "Register Tenant",
        filters={"property_id": property_id},
        fields=["name", "tenant_name", "profession", "purpose_of_use", "contact_information", "rental_period", "aadhar_number", "gst_number", "pan_card_number", "rent_amount", "renewal_date", "status", "attachments", "creation"],
        order_by="creation desc"
    )
    return tenants


@frappe.whitelist(allow_guest=True)
def get_all_registered_tenants():
    ensure_register_tenant_doctype()
    tenants = frappe.get_all(
        "Register Tenant",
        fields=["name", "tenant_name", "profession", "purpose_of_use", "contact_information", "rental_period", "aadhar_number", "gst_number", "pan_card_number", "rent_amount", "renewal_date", "property_id", "status", "creation"],
        order_by="creation desc"
    )
    return tenants


@frappe.whitelist(allow_guest=True)
def run_overlap_test(project_id="GIS-PROJ-05944"):
    import json
    
    def extract_points(coords):
        if not isinstance(coords, list):
            return []
        if len(coords) >= 2 and isinstance(coords[0], (int, float)) and isinstance(coords[1], (int, float)):
            return [[coords[0], coords[1]]]
        points = []
        for c in coords:
            if isinstance(c, list):
                points.extend(extract_points(c))
        return points

    def get_bbox(points):
        if not points:
            return None
        lats = [p[0] for p in points]
        lngs = [p[1] for p in points]
        return min(lats), max(lats), min(lngs), max(lngs)

    proj = frappe.get_doc("GIS Project", project_id)
    print(f"Project ID: {proj.name}")
    print(f"Project Type: {proj.project_type}")
    
    geom_str = proj.geometry
    if not geom_str:
        return "No geometry"
        
    geom = json.loads(geom_str)
    sel_coords = geom.get("coordinates")
    sel_points = extract_points(sel_coords)
    sel_bbox = get_bbox(sel_points)
    
    buildings = frappe.get_all(
        "GIS Project",
        filters={"project_type": ["in", ["BUILDING_INFO", "building_info"]]},
        fields=["name", "project_name", "geometry", "custom_attributes"]
    )
    
    overlaps = []
    for b in buildings:
        if not b.geometry:
            continue
        try:
            b_geom = json.loads(b.geometry)
            b_coords = b_geom.get("coordinates")
            b_pts = extract_points(b_coords)
            b_bbox = get_bbox(b_pts)
            if not b_bbox or not sel_bbox:
                continue
                
            if (sel_bbox[1] < b_bbox[0] or sel_bbox[0] > b_bbox[1] or
                sel_bbox[3] < b_bbox[2] or sel_bbox[2] > b_bbox[3]):
                continue
                
            shares_vertex = False
            for bp in b_pts:
                for sp in sel_points:
                    if abs(bp[0] - sp[0]) < 0.0001 and abs(bp[1] - sp[1]) < 0.0001:
                        shares_vertex = True
                        break
                if shares_vertex:
                    break
                    
            if shares_vertex:
                overlaps.append((b, "shared_vertex"))
            else:
                b_centroid = [sum(p[0] for p in b_pts)/len(b_pts), sum(p[1] for p in b_pts)/len(b_pts)]
                if (sel_bbox[0] <= b_centroid[0] <= sel_bbox[1] and
                    sel_bbox[2] <= b_centroid[1] <= sel_bbox[3]):
                    overlaps.append((b, "centroid_in_bbox"))
        except Exception:
            pass
            
    res_list = []
    for o, reason in overlaps:
        attrs = {}
        try:
            attrs = json.loads(o.custom_attributes) if o.custom_attributes else {}
        except Exception:
            pass
        bldg_id = attrs.get("BUILDING I") or attrs.get("Text") or attrs.get("BUILDING N") or "N/A"
        res_list.append(f"ID: {o.name}, Building ID: {bldg_id}, Reason: {reason}")
    
    print(f"Found {len(res_list)} overlaps:")
    for r in res_list:
        print(r)
    return res_list


@frappe.whitelist(allow_guest=True)
def get_reports_data():
    # 1. Fetch all reservation projects from the database
    projects = frappe.get_all(
        "GIS Project",
        filters={"project_type": ["in", ["MBMC-RESERVSTION", "MBMC-RESERVSTION-BOUNDARY"]]},
        fields=[
            "name", "project_name", "reservation_number", "reservation_name", 
            "village_name", "new_survey_no_hissa_no", "old_survey_no_hissa_no",
            "land_acquired_status", "encroachment_status", "mbmc_7_12", "road_length"
        ],
        ignore_permissions=True
    )

    # 2. Base counts
    total = len(projects)
    acquired = sum(1 for p in projects if p.get("land_acquired_status") == "ACQUIRED")
    not_acquired = sum(1 for p in projects if p.get("land_acquired_status") == "NOT_ACQUIRED")
    encroachment = sum(1 for p in projects if p.get("encroachment_status") == "ENCROACHMENT")

    # 3. Village-wise count
    villages_map = {}
    for p in projects:
        v = p.get("village_name")
        if v:
            v_clean = v.strip().upper()
            villages_map[v_clean] = villages_map.get(v_clean, 0) + 1
    
    # 4. Top Reservation Types
    res_types_map = {}
    for p in projects:
        rt = p.get("reservation_name") or p.get("project_name")
        if rt:
            rt_clean = rt.strip().upper()
            res_types_map[rt_clean] = res_types_map.get(rt_clean, 0) + 1

    # 5. Fetch all registered tenants
    tenants = frappe.get_all(
        "Register Tenant",
        fields=["name", "tenant_name", "rent_amount", "status", "property_id", "creation"],
        ignore_permissions=True
    )

    # Prepare project list for export and details
    raw_projects = []
    for p in projects:
        # Resolve survey number
        s_no = p.get("new_survey_no_hissa_no") or p.get("old_survey_no_hissa_no") or "-"
        # Resolve area
        area = p.get("road_length") or "-"
        
        raw_projects.append({
            "id": p.get("name"),
            "surveyNo": s_no,
            "reservationNo": p.get("reservation_number") or "-",
            "propertyName": p.get("reservation_name") or p.get("project_name") or "-",
            "village": p.get("village_name") or "-",
            "landStatus": p.get("land_acquired_status") or "NOT_ACQUIRED",
            "encroachment": p.get("encroachment_status") or "NA",
            "mbmc712": p.get("mbmc_7_12") or "-",
            "area": area
        })

    # Prepare tenant payments for collection trend
    raw_payments = []
    for t in tenants:
        p_name = "-"
        p_village = "-"
        p_survey = "-"
        if t.get("property_id"):
            match = next((p for p in projects if p.get("name") == t.get("property_id")), None)
            if match:
                p_name = match.get("reservation_name") or match.get("project_name") or "-"
                p_village = match.get("village_name") or "-"
                p_survey = match.get("new_survey_no_hissa_no") or match.get("old_survey_no_hissa_no") or "-"
        
        created_year = 2026
        if t.get("creation"):
            try:
                created_year = t.get("creation").year
            except:
                pass
                
        raw_payments.append({
            "invoice_id": f"INV-{t.get('name').split('-')[-1]}",
            "gis_id": t.get("property_id") or "-",
            "reservation_name": p_name,
            "village": p_village,
            "survey_no": p_survey,
            "year": created_year,
            "annual_amount": float(t.get("rent_amount") or 0),
            "due_date": t.get("creation").strftime("%d-%m-%Y") if t.get("creation") else "01-04-2026",
            "paid_date": t.get("creation").strftime("%d-%m-%Y") if t.get("creation") and t.get("status") == "Active" else "",
            "txn_id": f"TXN{t.get('name').split('-')[-1]}",
            "status": "paid" if t.get("status") == "Active" else "pending",
            "payment_mode": "Online" if t.get("status") == "Active" else ""
        })

    return {
        "stats": {
            "total": total,
            "acquired": acquired,
            "notAcquired": not_acquired,
            "encroachment": encroachment,
            "villages": villages_map,
            "resTypes": res_types_map
        },
        "projects": raw_projects,
        "payments": raw_payments
    }










