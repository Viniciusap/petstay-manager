const { createUploader } = require('../utils/files');

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOC_MIMES = [...ALLOWED_IMAGE_MIMES, 'application/pdf'];

const logoUploader = createUploader(ALLOWED_IMAGE_MIMES, 2);
const vaccinaUploader = createUploader(ALLOWED_DOC_MIMES, 10);
const photoUploader = createUploader(ALLOWED_IMAGE_MIMES, 15);

module.exports = { logoUploader, vaccinaUploader, photoUploader };
