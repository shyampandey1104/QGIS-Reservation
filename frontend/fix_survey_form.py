import re

file_path = '/Users/shyamkumarpandey/.gemini/antigravity/scratch/qgis_reservation/frappe-bench/apps/qgis/frontend/src/pages/PropertyRecords.jsx'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Fix the checklist
old_checklist = """  const checklist = [
    { label: 'Property size',              done: !!plotArea.trim() && !!constructedArea.trim() && !!carpetArea.trim() },
    { label: 'Address details',            done: !!address.trim() },
    { label: 'Property user history',      done: !!tenantName.trim() },
    { label: 'Tenant / department details',done: !!contact.trim() && !!rentalPeriod.trim() },
    { label: 'Mandatory documents',        done: !!documents.trim() },
    { label: 'Photo capture',              done: photoCaptured },
    { label: 'Geo location',               done: !!geoLocation.trim() },
    { label: 'Existing usage',             done: !!existingUsage.trim() },
  ];"""

new_checklist = """  const checklist = [
    { label: 'Property Type',              done: !!propertyType.trim() },
    { label: 'Property ID',                done: !!propertyId.trim() && propertyId !== 'Auto generate' },
    { label: 'Plot Area',                  done: !!plotArea.trim() },
    { label: 'Constructed Area',           done: !!constructedArea.trim() },
    { label: 'Carpet Area',                done: !!carpetArea.trim() },
    { label: 'Existing Usage',             done: !!existingUsage.trim() },
    { label: 'Address',                    done: !!address.trim() },
    { label: 'Geo Location',               done: !!geoLocation.trim() },
    { label: 'Tenant Name',                done: !!tenantName.trim() },
    { label: 'Contact',                    done: !!contact.trim() },
    { label: 'Rental Period',              done: !!rentalPeriod.trim() },
    { label: 'Documents',                  done: !!documents },
    { label: 'Photo capture',              done: photoCaptured },
  ];"""

content = content.replace(old_checklist, new_checklist)

# 2. Fix the Documents input and add Photo Capture button
old_docs_input = """                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Documents</label>
                <input type="text" value={documents} onChange={e => setDocuments(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
                  placeholder="Enter documents list"
                />
              </div>

            </div>"""

new_docs_input = """                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Documents</label>
                <input type="file" onChange={e => setDocuments(e.target.files[0]?.name || '')}
                  style={{ width: '100%', padding: '6px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white', cursor: 'pointer' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase' }}>Photo Capture</label>
                <button onClick={() => setPhotoCaptured(prev => !prev)} style={{ width: '100%', padding: '9px 12px', fontSize: '13px', fontWeight: 700, background: photoCaptured ? '#dcfce7' : '#f1f5f9', color: photoCaptured ? '#166534' : '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}>
                  {photoCaptured ? '✅ Photo Captured' : '📷 Take Photo'}
                </button>
              </div>

            </div>"""

content = content.replace(old_docs_input, new_docs_input)

with open(file_path, 'w') as f:
    f.write(content)

print("Done replacing.")
