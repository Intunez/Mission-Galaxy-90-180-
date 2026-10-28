const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||process.argv[2]||'';
if(!/^mission-galaxy-[a-z0-9-]+$/.test(project)||project.includes('machtentempel')){console.error('STOP: selecteer expliciet het eigen mission-galaxy-* Firebase-project. De Machtentempel mag niet worden gebruikt.');process.exit(1)}
console.log('Afzonderlijk Mission Galaxy-project gecontroleerd.');
