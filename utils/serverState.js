const os = require('os');

const state = {
    maintenanceMode: false,
    registrationEnabled: true
};

function getMetrics() {
    return {
        uptime: process.uptime(),
        memoryTotal: os.totalmem(),
        memoryFree: os.freemem(),
        cpuLoad: os.loadavg(),
        maintenanceMode: state.maintenanceMode,
        registrationEnabled: state.registrationEnabled
    };
}

module.exports = {
    state,
    getMetrics
};
