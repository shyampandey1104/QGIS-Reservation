import fetch from 'node-fetch';
const run = async () => {
  try {
    const res = await fetch('http://localhost:8000/api/method/qgis.api.gis_project.get_projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    console.log(JSON.stringify(data.message.slice(0, 2), null, 2));
  } catch(e) { console.error(e); }
}
run();
