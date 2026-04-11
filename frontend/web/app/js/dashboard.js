angular.module('kernelPulse').config(['$routeProvider', function($routeProvider) {
    // Override the default system-status route to our new dashboard design
    $routeProvider.when('/system-status', {
        templateUrl: 'views/dashboard.html',
        controller: 'DashboardCtrl'
    });
}]);

angular.module('kernelPulse').controller('DashboardCtrl', ['$scope', 'server', '$interval', '$timeout', '$http', function($scope, server, $interval, $timeout, $http) {
    
    // Scoped Data Setup
    $scope.cpuStatus = 'STABLE';
    $scope.cpuPercent = 0;
    
    $scope.memUsed = 0;
    $scope.memTotal = 0;
    $scope.memPercentage = 0;

    $scope.diskPercent = 0;
    $scope.diskUsedDisplay = '';
    
    $scope.netDownload = 0;
    $scope.netUpload = 0;

    $scope.sysHostname = '';
    $scope.sysOs = '';
    $scope.sysKernel = '';

    $scope.temp = '--';
    $scope.tempStatus = 'OPTIMAL';
    $scope.processes = 0;
    $scope.loadAvg = 0;

    // ── AI Insights State ─────────────────────────────────────────────────────
    $scope.aiStatus = {};
    $scope.aiAdvice = [];
    $scope.aiExhaustion = {};
    $scope.aiOverallLevel = 'normal';
    $scope.aiOverallLabel = 'ALL NORMAL';
    $scope.aiHasData = false;

    // Toast notification state
    $scope.toastMessages = [];
    $scope.toastVisible = false;
    var prevAdvice = [];

    // Sparkline configuration
    var cpuValues = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    function drawSparkline() {
        var canvas = document.getElementById('cpuSparkline');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        var w = canvas.width;
        var h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        if (cpuValues.length === 0) return;
        
        var step = w / (cpuValues.length - 1);
        ctx.beginPath();
        
        var x = 0;
        var y = h - (cpuValues[0] / 100 * h);
        ctx.moveTo(x, y);
        
        for (var i = 1; i < cpuValues.length; i++) {
            x += step;
            y = h - (cpuValues[i] / 100 * h);
            
            // smooth curve approximation
            var prevX = x - step;
            var prevY = h - (cpuValues[i-1] / 100 * h);
            var cpX = prevX + step / 2;
            
            ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
        }
        
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#2dd4bf'; // Teal primary
        ctx.stroke();
        
        // Fill area under the curve
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fillStyle = 'rgba(45, 212, 191, 0.1)';
        ctx.fill();
    }

    // Converters
    var formatBytes = function(bytes, decimals) {
        if (bytes == 0) return '0 Bytes';
        var k = 1024, dm = decimals <= 0 ? 0 : decimals || 2;
        var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    var humanizeMbToGb = function(mb) {
        return (mb / 1024).toFixed(1);
    };

    // ── AI Ingest — feed metric values to the ML backend ──────────────────────
    function ingest(metric, value) {
        var v = Number(value);
        if (isNaN(v)) return;
        $http.post('/api/ingest', { metric: metric, value: v }).catch(function() {});
    }

    // ── AI Polling — fetch alerts and insights from the ML backend ─────────────
    function pollAlerts() {
        $http.get('/api/alerts').then(function(resp) {
            var data = resp.data;
            if (data.error) return;

            $scope.aiStatus = data.status || {};
            $scope.aiAdvice = data.advice || [];
            $scope.aiHasData = Object.keys($scope.aiStatus).length > 0 || $scope.aiAdvice.length > 0;

            // Compute overall level
            var values = Object.values($scope.aiStatus);
            if (values.indexOf('ANOMALY') !== -1) {
                $scope.aiOverallLevel = 'anomaly';
                $scope.aiOverallLabel = 'ANOMALY DETECTED';
            } else if (values.indexOf('WARNING') !== -1) {
                $scope.aiOverallLevel = 'warning';
                $scope.aiOverallLabel = 'WARNING';
            } else {
                $scope.aiOverallLevel = 'normal';
                $scope.aiOverallLabel = 'ALL NORMAL';
            }

            // Detect new actionable alerts for toast notifications
            var curr = $scope.aiAdvice;
            var added = curr.filter(function(a) {
                return prevAdvice.indexOf(a) === -1 &&
                       a.indexOf('✅') !== 0 &&
                       a.indexOf('🟢') !== 0;
            });
            if (added.length > 0) {
                showToast(added);
            }
            prevAdvice = curr.slice();
        }).catch(function() { /* server not up yet */ });
    }

    function pollInsights() {
        $http.get('/api/anomaly').then(function(resp) {
            var data = resp.data;
            if (data.error) return;
            $scope.aiExhaustion = data.exhaustion || {};
        }).catch(function() { /* server not up yet */ });
    }

    // ── Toast Notification ────────────────────────────────────────────────────
    var toastTimer = null;

    function showToast(messages) {
        $scope.toastMessages = messages.slice(0, 3);
        $scope.toastVisible = true;
        if (toastTimer) $timeout.cancel(toastTimer);
        toastTimer = $timeout(function() {
            $scope.toastVisible = false;
        }, 6000);
    }

    $scope.dismissToast = function() {
        if (toastTimer) $timeout.cancel(toastTimer);
        $scope.toastVisible = false;
    };

    $scope.toastSeverity = function(msg) {
        if (msg.indexOf('🔴') !== -1 || msg.indexOf('🚨') !== -1) return 'critical';
        if (msg.indexOf('💧') !== -1 || msg.indexOf('⏱️') !== -1 ||
            msg.indexOf('⚠️') !== -1 || msg.indexOf('⚡') !== -1) return 'warning';
        return 'info';
    };

    // ── AI helper functions for the template ──────────────────────────────────
    $scope.aiStatusEntries = function() {
        var entries = [];
        angular.forEach($scope.aiStatus, function(status, metric) {
            entries.push({ metric: metric, status: status });
        });
        return entries;
    };

    $scope.aiExhaustionEntries = function() {
        var entries = [];
        angular.forEach($scope.aiExhaustion, function(data, metric) {
            entries.push({ metric: metric, data: data });
        });
        return entries;
    };

    var METRIC_LABELS = {
        cpu: 'CPU', ram: 'RAM', disk_read: 'Disk', disk_write: 'Disk Write',
        net_rx: 'Net In', net_tx: 'Net Out', temp: 'Temp', load_avg: 'Load Avg'
    };

    $scope.metricLabel = function(metric) {
        return METRIC_LABELS[metric] || metric.replace(/_/g, ' ').toUpperCase();
    };

    $scope.statusBadgeClass = function(status) {
        if (status === 'ANOMALY') return 'ai-badge-anomaly';
        if (status === 'WARNING') return 'ai-badge-warning';
        if (status === 'LEARNING') return 'ai-badge-learning';
        return 'ai-badge-normal';
    };

    $scope.adviceClass = function(msg) {
        if (msg.indexOf('🔴') !== -1 || msg.indexOf('🚨') !== -1) return 'ai-advice-critical';
        if (msg.indexOf('🟡') !== -1 || msg.indexOf('💧') !== -1 ||
            msg.indexOf('⏱️') !== -1 || msg.indexOf('⚠️') !== -1 ||
            msg.indexOf('⚡') !== -1) return 'ai-advice-warning';
        return 'ai-advice-ok';
    };

    // Data Fetchers — each now calls ingest() to feed the AI
    function getCpuData() {
        server.get('cpu_utilization', function(resp) {
            $scope.cpuPercent = parseInt(resp);
            
            if ($scope.cpuPercent < 50) $scope.cpuStatus = 'STABLE';
            else if ($scope.cpuPercent < 80) $scope.cpuStatus = 'MODERATE';
            else $scope.cpuStatus = 'HIGH';

            cpuValues.push($scope.cpuPercent);
            if (cpuValues.length > 20) {
                cpuValues.shift();
            }
            // Need a slight delay to ensure canvas is rendered initially
            $timeout(drawSparkline, 0);
            ingest('cpu', $scope.cpuPercent);
        });
    }

    function getMemoryData() {
        server.get('current_ram', function(resp) {
            $scope.memUsed = humanizeMbToGb(resp.used);
            $scope.memTotal = humanizeMbToGb(resp.total);
            $scope.memPercentage = (resp.used / resp.total) * 100;
            ingest('ram', $scope.memPercentage);
        });
    }

    function getDiskData() {
        server.get('disk_space', function(resp) {
            // Find root or primary mount
            var primary = resp[0];
            for (var i = 0; i < resp.length; i++) {
                var mp = resp[i].mounted_on || resp[i].mounted || '';
                if (mp === '/') {
                    primary = resp[i];
                    break;
                }
            }
            if (primary) {
                var pctStr = primary['used%'] || primary.use_percentage || '0%';
                $scope.diskPercent = parseInt(pctStr);
                var usedStr = String(primary.used || '').replace('G', 'GB').replace('M', 'MB');
                var totalStr = String(primary.size || '').replace('G', 'GB').replace('M', 'MB');
                $scope.diskUsedDisplay = usedStr + ' of ' + totalStr;
                ingest('disk_read', $scope.diskPercent);
            }
        });
    }

    function getNetworkData() {
        server.get('bandwidth', function(resp) {
            var totalTx = 0, totalRx = 0;
            if (Array.isArray(resp)) {
                resp.forEach(function(iface) {
                    var name = (iface.interface || '').replace(':', '');
                    if (name !== 'lo') {
                        totalTx += iface.tx || 0;
                        totalRx += iface.rx || 0;
                    }
                });
            }
            $scope.netUpload = (totalTx / 1024).toFixed(0) + ' KB';
            $scope.netDownload = (totalRx / 1024).toFixed(0) + ' KB';
            ingest('net_rx', totalRx / 1024);
            ingest('net_tx', totalTx / 1024);
        });
    }

    function getIdentityData() {
        server.get('general_info', function(resp) {
            $scope.sysHostname = resp.hostname;
            $scope.sysOs = resp.os;
        });

        server.get('issue', function(resp) {
            $scope.sysOs = resp;
        });

        // Use unname -r or something similar, or fallback to general_info os if kernel not available
    }

    function getBottomMetrics() {
        server.get('cpu_temp', function(resp) {
            if (resp && resp !== 'null') {
                var t = parseInt(resp);
                $scope.temp = t + '°C';
                $scope.tempStatus = t < 60 ? 'OPTIMAL' : 'WARM';
                ingest('temp', t);
            }
        });

        server.get('number_of_cpu_cores', function(resp) {
            // Optional usage
        });

        server.get('load_avg', function(resp) {
            if (resp && resp[1]) {
                 // 15 min average is usually element 2 or 1
                 $scope.loadAvg = resp[2][0] || resp[0][0]; // Depending on format
            } else if (Array.isArray(resp)) {
                 $scope.loadAvg = resp[2] && resp[2][0] ? resp[2][0] : resp[0] && resp[0][0] ? resp[0][0] : 0;
                 if (typeof $scope.loadAvg === 'object') $scope.loadAvg = resp[0].join(' '); // fallback
            } else if (typeof resp === 'string') {
                 var parts = resp.split(' ');
                 $scope.loadAvg = parts.length > 2 ? parts[2] : parts[0];
            }
            ingest('load_avg', parseFloat($scope.loadAvg) || 0);
        });

        // Fetch real process count from the server
        server.get('process_count', function(resp) {
            var count = parseInt(resp);
            if (!isNaN(count) && count > 0) {
                $scope.processes = count;
            }
        });
    }

    // Initiators
    function fetchAll() {
        getCpuData();
        getMemoryData();
        getDiskData();
        getNetworkData();
        getBottomMetrics();
        getIdentityData();
    }
    
    // Initial fetch
    fetchAll();

    // Initial AI poll
    pollAlerts();
    pollInsights();

    // Setup polling
    var intervalPromise = $interval(function() {
        getCpuData();
        getMemoryData();
        getNetworkData();
        getBottomMetrics();
    }, 1500);

    // Refresh disk slower
    var slowIntervalPromise = $interval(function() {
         getDiskData();
    }, 10000);

    // AI polling — alerts every 5s, full insights every 15s
    var aiAlertInterval = $interval(pollAlerts, 5000);
    var aiInsightInterval = $interval(pollInsights, 15000);

    // Cleanup
    $scope.$on('$destroy', function() {
        $interval.cancel(intervalPromise);
        $interval.cancel(slowIntervalPromise);
        $interval.cancel(aiAlertInterval);
        $interval.cancel(aiInsightInterval);
        if (toastTimer) $timeout.cancel(toastTimer);
    });

}]);
