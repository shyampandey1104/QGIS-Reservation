frappe.listview_settings['GIS Project'] = {
    add_fields: ['status'],

    get_indicator: function(doc) {
        const status_map = {
            'Draft':               ['Draft',               'gray'],
            'Pending for Request': ['Pending for Request', 'orange'],
            'Submitted':           ['Submitted',           'blue'],
            'Approved':            ['Approved',            'green'],
            'Rejected':            ['Rejected',            'red'],
            'Correction':          ['Correction',          'yellow'],
        };

        const entry = status_map[doc.status];
        if (entry) {
            return [entry[0], entry[1], 'status,=,' + doc.status];
        }
        return [doc.status, 'gray', 'status,=,' + doc.status];
    }
};
