// main.js - UXP Plugin for Photoshop Layer Export
const { app, action, core } = require('photoshop');
const fs = require('uxp').storage.localFileSystem;
const shell = require('uxp').shell;

// Assuming Firebase SDK is in a 'firebase' folder in your project
const firebase = require('./firebase/firebase-app.js');
require('./firebase/firebase-firestore.js');

class LayerExportPlugin {
    constructor() {
        this.foundLayers = [];
        this.selectedLayer = null;
        this.exportFolder = null;
        this.isExporting = false;
        this.cancelRequested = false;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.checkDocument();
        this.log('Layer Export Plugin initialized', 'info');

        // Initialize Firebase
        const firebaseConfig = {
            apiKey: "AIzaSyAanoVcKyg3IhlRjTFRBJoC7z3f_w2MnwQ",
            authDomain: "photoshop-plugin-dcd4d.firebaseapp.com",
            projectId: "photoshop-plugin-dcd4d",
            storageBucket: "photoshop-plugin-dcd4d.firebasestorage.app",
            messagingSenderId: "556306847015",
            appId: "1:556306847015:web:901b7f6acdf38ebd724502"
        };

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        this.db = firebase.firestore();

        // Add a basic Firestore example
        this.addFirestoreExample();
    }

    async addFirestoreExample() {
        try {
            // Write data to Firestore
            await this.db.collection("plugin_data").doc("example").set({
                message: "Hello from Photoshop plugin!",
                timestamp: new Date()
            });
            this.log("Data successfully written to Firestore!", 'info');

            // Read data from Firestore
            const doc = await this.db.collection("plugin_data").doc("example").get();
            if (doc.exists) {
                this.log("Data read from Firestore: " + JSON.stringify(doc.data()), 'info');
            } else {
                this.log("No such document!", 'warn');
            }
        } catch (error) {
            this.log("Error interacting with Firestore: " + error, 'error');
        }
    }

    bindEvents() {
        // Existing event binding logic here
    }

    async checkDocument() {
        // Existing document check logic here
    }

    log(message, type = 'info') {
        console[type](`[LayerExportPlugin] ${message}`);
    }
}

// Instantiate the plugin
const plugin = new LayerExportPlugin();

// Export for UXP
module.exports = {
    panels: {
        // Panel definitions here
    }
};