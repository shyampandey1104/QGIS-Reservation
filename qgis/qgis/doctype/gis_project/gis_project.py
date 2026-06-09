# Copyright (c) 2026, QGIS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class GISProject(Document):
	def after_insert(self):
		frappe.cache().delete_keys("gis_projects_cache_")

	def on_update(self):
		frappe.cache().delete_keys("gis_projects_cache_")
	
	def on_trash(self):
		frappe.cache().delete_keys("gis_projects_cache_")
