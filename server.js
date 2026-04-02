const express = require('express');
const app = require('./api/verify');

// هذا السطر لإخبار Vercel أن ملف verify.js هو المسؤول عن التشغيل
module.exports = app;
