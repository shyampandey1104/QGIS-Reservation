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
}


def _get_user_gis_role():
    user_roles = frappe.get_roles(frappe.session.user)
    for role in ["GIS Department Head", "GIS Senior Engineer", "GIS Assistant Engineer", "GIS Junior Engineer"]:
        if role in user_roles:
            return role
    if "System Manager" in user_roles:
        return "System Manager"
    return None


def _serialize(p, geometry):
    # Retrieve actual layer name from description if saved by manual upload
    p_type = p["project_type"]
    if p.get("description") and "LAYER_TYPE:" in p["description"]:
        try:
            p_type = p["description"].split("LAYER_TYPE:")[1].split(" |")[0].strip()
        except: pass

    return {
        "id": p["name"],
        "name": p["project_name"],
        "road_name": p.get("road_name"),
        "ward": p["ward"],
        "type": p_type,
        "status": p["status"],
        "budget": p["budget"],
        "road_length": p.get("road_length"),
        "contractor_details": p.get("contractor_details"),
        "start_date": str(p["start_date"]) if p["start_date"] else None,
        "completion_date": str(p["completion_date"]) if p["completion_date"] else None,
        "description": p["description"],
        "remarks": p["remarks"],
        "submitted_by_role": p.get("submitted_by_role"),
        "coordinates": geometry.get("coordinates") if geometry else [],
        "geom_type": geometry.get("type") if geometry else "Polygon",
        "created_at": str(p["creation"]),
        "owner": p["owner"],
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
        "bridg_name": p.get("bridg_name"),
        "bridg_type": p.get("bridg_type"),
        "fly_name": p.get("fly_name"),
    }


@frappe.whitelist(allow_guest=True)
def get_public_stats():
    """Dynamic stats for login page and public portal"""
    all_projects = frappe.get_all(
        "GIS Project",
        fields=["status", "ward", "budget"]
    )
    approved = [p for p in all_projects if p["status"] == "Approved"]

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

    return {
        "total_projects": len(all_projects),
        "approved_projects": len(approved),
        "total_wards": len(wards),
        "total_budget": fmt_budget(total_budget),
        "total_budget_raw": total_budget,
    }


@frappe.whitelist(allow_guest=True)
def get_projects(status=None):
    filters = {}
    if status:
        filters["status"] = status

    # Non-logged-in users only see approved
    if frappe.session.user == "Guest":
        filters["status"] = "Approved"

    try:
        projects = frappe.get_all(
            "GIS Project",
            filters=filters,
            fields=["name", "project_name", "road_name", "ward", "project_type", "status",
                    "budget", "road_length", "contractor_details", "start_date",
                    "completion_date", "description", "remarks", "geometry",
                    "submitted_by_role", "creation", "owner",
                    "road_no", "road_type", "pave_type", "landmark", "authority",
                    "traffic", "width", "shape_length", "unp_name", "unp_type",
                    "dma_no", "ward_no", "junc_name", "facility", "rail_route", 
                    "bridg_name", "bridg_type", "fly_name"],
            order_by="creation desc"
        )
    except Exception as e:
        frappe.log_error(f"Database query failed: {str(e)}", "GIS API Error")
        return []

    result = []
    for p in projects:
        geo = None
        if p.get("geometry"):
            try:
                # Ensure geometry is a valid JSON string
                geom_str = p["geometry"].strip() if isinstance(p["geometry"], str) else "{}"
                if geom_str:
                    geo = json.loads(geom_str)
            except Exception:
                # Fallback for corrupted geometry
                geo = {"type": "Polygon", "coordinates": []}
        
        try:
            result.append(_serialize(p, geo))
        except Exception as e:
            frappe.log_error(f"Serialization failed for {p.get('name')}: {str(e)}", "GIS API Error")
            continue
            
    return result


@frappe.whitelist(allow_guest=True)
def get_approved_projects():
    return get_projects(status="Approved")


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
    description=None, budget=None, road_length=None,
    contractor_details=None, start_date=None,
    completion_date=None, remarks=None,
    road_name=None, road_no=None, road_type=None,
    pave_type=None, landmark=None, authority=None,
    traffic=None, width=None, shape_length=None,
    unp_name=None, unp_type=None
):
    role = _get_user_gis_role()
    if not role:
        frappe.throw("You do not have a GIS role assigned.")

    perms = ROLE_TRANSITIONS.get(role, {})
    if not perms.get("can_create"):
        frappe.throw(f"Role '{role}' is not allowed to create projects.")

    if isinstance(coordinates, str):
        coordinates = json.loads(coordinates)

    geometry = json.dumps({"type": "Polygon", "coordinates": coordinates})

    doc = frappe.get_doc({
        "doctype": "GIS Project",
        "project_name": project_name,
        "ward": ward,
        "project_type": "Other Infrastructure", # Safe fallback
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
    })
    doc.insert(ignore_permissions=True, ignore_mandatory=True)
    frappe.db.set_value("GIS Project", doc.name, "project_type", project_type, update_modified=False)
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
def update_status(project_id, status):
    role = _get_user_gis_role()
    if not role:
        frappe.throw("You do not have a GIS role assigned.")

    perms = ROLE_TRANSITIONS.get(role, {})
    doc = frappe.get_doc("GIS Project", project_id)

    if doc.status not in perms.get("allowed_from", []):
        frappe.throw(f"Role '{role}' cannot act on a project with status '{doc.status}'.")

    if status not in perms.get("allowed_to", []):
        frappe.throw(f"Role '{role}' cannot set status to '{status}'.")

    doc.status = status
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"id": project_id, "status": status}


@frappe.whitelist()
def update_geometry(project_id, coordinates):
    role = _get_user_gis_role()
    if not role:
        frappe.throw("You do not have a GIS role assigned.")
    if isinstance(coordinates, str):
        coordinates = json.loads(coordinates)
    doc = frappe.get_doc("GIS Project", project_id)
    doc.geometry = json.dumps({"type": "Polygon", "coordinates": coordinates})
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"id": project_id, "updated": True}


@frappe.whitelist()
def delete_project(project_id):
    role = _get_user_gis_role()
    if role not in ["GIS Junior Engineer", "System Manager"]:
        frappe.throw("Only Junior Engineers or System Managers can delete projects.")

    doc = frappe.get_doc("GIS Project", project_id)
    if doc.status != "Draft":
        frappe.throw("Only Draft projects can be deleted.")

    frappe.delete_doc("GIS Project", project_id, ignore_permissions=True)
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
    suffix = os.path.splitext(uploaded_file.filename)[1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
        tf.write(cnt)
        temp_path = tf.name

    def _flip_coords(coords):
        """Recursively flip [lng, lat] to [lat, lng]"""
        if isinstance(coords[0], (int, float)):
            return [coords[1], coords[0]]
        return [_flip_coords(c) for c in coords]

    try:
        # 1. Get List of Layers
        info_cmd = ["/opt/homebrew/bin/ogrinfo", "-ro", "-q", temp_path]
        try:
            info_res = subprocess.run(info_cmd, capture_output=True, text=True, check=True)
        except subprocess.CalledProcessError as e:
            return {"success": False, "error": f"ogrinfo failed: {e.stderr or e.output or str(e)}"}
        except FileNotFoundError:
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
        saved_count = 0
        for layer in layer_names:
            cmd = ["/opt/homebrew/bin/ogr2ogr", "-f", "GeoJSON", "-t_srs", "EPSG:4326", "/vsistdout/", temp_path, layer]
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
                    
                    # Preserve original layer name from the file
                    final_type = layer

                    doc = frappe.get_doc({
                        "doctype": "GIS Project",
                        "project_name": p_name,
                        "ward": ward,
                        "project_type": "Other Infrastructure", # Safe fallback for insert
                        "status": "Draft",
                        "description": f"LAYER_TYPE:{layer} | Imported from {uploaded_file.filename}",
                        "submitted_by_role": role,
                        "geometry": json.dumps(geom),
                        "remarks": f"Source Layer: {layer}",
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
                        "remarks": props.get("Remark") or props.get("remarks") or f"Source Layer: {layer}"
                    })
                    doc.insert(ignore_permissions=True, ignore_mandatory=True)
                    # Forcibly update the type to the original layer name to bypass hidden Select validations
                    frappe.db.set_value("GIS Project", doc.name, "project_type", final_type, update_modified=False)
                    saved_count += 1
        
        frappe.db.commit()
        # Cleanup
        os.unlink(temp_path)
        
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
