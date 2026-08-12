const elementRoot = document.getElementById('root');
let size;
let scale;
let orbitRadius;
const paddingOrbit = 0.8;
const ayanamsa = 24 + 16/60;

const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svg.style.position = 'fixed';
svg.style.left = '50%';
svg.style.top = '50%';
svg.style.transform = 'translate(-50%, -50%)';

const sunDisk = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
sunDisk.setAttribute('style', 'fill:#f9ca24; stroke:#f0932b; stroke-width:2');
svg.appendChild(sunDisk);

const moonDisk = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
moonDisk.setAttribute('style', 'fill:#dfe6e9; stroke:#636e72; stroke-width:1');
svg.appendChild(moonDisk);

const orbit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
orbit.setAttribute('style', 'fill:none; stroke:#636e72; stroke-width:2; stroke-dasharray: 6 4');
svg.appendChild(orbit);

const boundaryLines = [];
for (let i = 0; i < 12; i += 1) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'degree-boundary');
    line.setAttribute('style', 'stroke:#a4b0be; stroke-width:1; opacity:0.8');
    svg.appendChild(line);
    boundaryLines.push(line);
}

const nakshatraOrbit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
nakshatraOrbit.setAttribute('style', 'fill:none; stroke:#7f8c8d; stroke-width:1; opacity:0.9');
svg.appendChild(nakshatraOrbit);

const nakshatraBoundaryLines = [];
const nakshatraMarkers = [];
for (let i = 0; i < 27; i += 1) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('style', 'stroke:#95a5a6; stroke-width:0.8; opacity:0.7');
    svg.appendChild(line);
    nakshatraBoundaryLines.push(line);

    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    marker.setAttribute('style', 'fill:#74b9ff; stroke:#0984e3; stroke-width:0.8');
    svg.appendChild(marker);
    nakshatraMarkers.push(marker);
}

const ascLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
ascLine.setAttribute('style', 'stroke:#eb4d4b; stroke-width:6; stroke-linecap:round;');
svg.appendChild(ascLine);

const zodiacSymbols = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
for (let i = 0; i < zodiacSymbols.length; i += 1) {
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.classList.add('zodiac-symbol');
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'central');
    txt.setAttribute('fill', '#6c5ce7');
    txt.textContent = zodiacSymbols[i];
    svg.appendChild(txt);
}
elementRoot.appendChild(svg);

let userLat = parseFloat(localStorage.getItem('savedLat')) || 11.258121310045759;
let userLon = parseFloat(localStorage.getItem('savedLon')) || 75.77228348901123;

let currentDate = new Date();
let isManualMode = false;
let lastRealTime = Date.now();

function normalize(value) {
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
}

function angleDifference(a, b) {
    const diff = Math.abs(normalize(a - b));
    return diff > 180 ? 360 - diff : diff;
}

function getEphemerisState(date) {
    const atime = Astronomy.MakeTime(date);
    const jd = fnGetJulianDate(date);
    const t = (jd - 2451545.0) / 36525.0;

    const sunPos = Astronomy.SunPosition(atime);
    const moonPos = Astronomy.EclipticGeoMoon(atime);

    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t;
    const lstRad = normalize(gmst + userLon) * Math.PI / 180.0;
    const eps = (23.43929 - 0.01300 * t) * Math.PI / 180;
    const phi = userLat * Math.PI / 180;

    const y = Math.cos(lstRad);
    const x = -(Math.sin(lstRad) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps));
    const ascLon = normalize((Math.atan2(y, x) * 180.0 / Math.PI - ayanamsa));

    sunLonAyanamsamAdjusted = sunPos.elon - ayanamsa;
    moonLonAyanamsamAdjusted = moonPos.lon - ayanamsa;
    
    return {
        sunLon: sunLonAyanamsamAdjusted,
        moonLon: moonLonAyanamsamAdjusted,
        ascLon
    };
}

async function fetchJsonWithProxy(url) {
    const proxyUrls = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];

    let lastError;
    for (const proxyUrl of proxyUrls) {
        try {
            const response = await fetch(proxyUrl, { mode: 'cors', cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const text = await response.text();
            return JSON.parse(text);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Proxy fetch failed');
}

async function fetchNasaJplLongitude(date, targetCode) {
    const timeValue = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')} UT`;
    const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
    url.searchParams.set('format', 'json');
    url.searchParams.set('EPHEM_TYPE', 'VECTORS');
    url.searchParams.set('OBJ_DATA', 'NO');
    url.searchParams.set('COMMAND', `'${targetCode}'`);
    url.searchParams.set('CENTER', "'500@399'");
    url.searchParams.set('REF_PLANE', 'ECLIPTIC');
    url.searchParams.set('REF_FRAME', 'J2000');
    url.searchParams.set('OUT_UNITS', 'AU-D');
    url.searchParams.set('TLIST', timeValue);

    const data = await fetchJsonWithProxy(url.toString());
    const resultText = typeof data.result === 'string' ? data.result : '';
    const xMatch = resultText.match(/X\s*=\s*([\-\d.eE]+)/i);
    const yMatch = resultText.match(/Y\s*=\s*([\-\d.eE]+)/i);
    const zMatch = resultText.match(/Z\s*=\s*([\-\d.eE]+)/i);

    if (!xMatch || !yMatch || !zMatch) {
        throw new Error('Could not parse JPL vector data');
    }

    const x = parseFloat(xMatch[1]);
    const y = parseFloat(yMatch[1]);
    const z = parseFloat(zMatch[1]);
    const longitude = normalize(Math.atan2(y, x) * 180 / Math.PI);
    return longitude;
}

async function syncWithOnlineTime() {
    try {
        const onlineDate = new Date();
        const [sunLon, moonLon] = await Promise.all([
            fetchNasaJplLongitude(onlineDate, '10'),
            fetchNasaJplLongitude(onlineDate, '301')
        ]);

        const localState = getEphemerisState(currentDate);
        const stateDrift = Math.max(
            angleDifference(sunLon, localState.sunLon),
            angleDifference(moonLon, localState.moonLon)
        );

        console.log('NASA JPL sync comparison', {
            onlineDate: onlineDate.toISOString(),
            sunLongitude: sunLon.toFixed(6),
            moonLongitude: moonLon.toFixed(6),
            libraryStateDrift: stateDrift.toFixed(6)
        });

        currentDate = onlineDate;
        lastRealTime = Date.now();
        updatePositions();

        return { onlineDate, sunLon, moonLon, stateDrift };
    } catch (error) {
        console.warn('NASA JPL sync failed', error);
        return null;
    }
}

function updatePositions() {
    if (!scale) {
        return;
    }

    const ephemeris = getEphemerisState(currentDate);
    const sunAngle = ((ephemeris.sunLon - 90) * Math.PI / 180);
    sunDisk.setAttribute('cx', scale + orbitRadius * Math.cos(sunAngle));
    sunDisk.setAttribute('cy', scale + orbitRadius * Math.sin(sunAngle));
    sunDisk.setAttribute('r', scale / 12);

    const moonAngle = (ephemeris.moonLon - 90) * Math.PI / 180;
    moonDisk.setAttribute('cx', scale + (orbitRadius * 0.78) * Math.cos(moonAngle));
    moonDisk.setAttribute('cy', scale + (orbitRadius * 0.78) * Math.sin(moonAngle));
    moonDisk.setAttribute('r', scale / 18);

    const aAngle = (ephemeris.ascLon - 90) * Math.PI / 180;
    const ascLineLength = 0.3;
    const ascLineStart = 1 - ascLineLength / 2;
    const ascLineEnd = 1 + ascLineLength / 2;
    ascLine.setAttribute('x1', scale + (orbitRadius * ascLineStart) * Math.cos(aAngle));
    ascLine.setAttribute('y1', scale + (orbitRadius * ascLineStart) * Math.sin(aAngle));
    ascLine.setAttribute('x2', scale + (orbitRadius * ascLineEnd) * Math.cos(aAngle));
    ascLine.setAttribute('y2', scale + (orbitRadius * ascLineEnd) * Math.sin(aAngle));

    updateUI(currentDate);
}

async function verifyAndCorrectEphemeris() {
    const realDate = new Date();
    const liveState = getEphemerisState(realDate);
    const currentState = getEphemerisState(currentDate);
    const sunDrift = angleDifference(liveState.sunLon, currentState.sunLon);
    const moonDrift = angleDifference(liveState.moonLon, currentState.moonLon);
    const ascDrift = angleDifference(liveState.ascLon, currentState.ascLon);
    const drift = Math.max(sunDrift, moonDrift, ascDrift);

    console.log('Ephemeris drift', {
        sunDrift: sunDrift.toFixed(6),
        moonDrift: moonDrift.toFixed(6),
        ascDrift: ascDrift.toFixed(6),
        totalDrift: drift.toFixed(6),
        currentDate: currentDate.toISOString(),
        realDate: realDate.toISOString()
    });

    await syncWithOnlineTime();

    if (drift > 0.5) {
        currentDate = realDate;
        lastRealTime = Date.now();
        updatePositions();
    }
}

function formatLongitude(longitude) {
    const normalized = normalize(longitude);
    const degrees = Math.floor(normalized);
    const minutes = Math.floor((normalized - degrees) * 60);
    const sign = ['♈ Aries', '♉ Taurus', '♊ Gemini', '♋ Cancer', '♌ Leo', '♍ Virgo', '♎ Libra', '♏ Scorpio', '♐ Sagittarius', '♑ Capricorn', '♒ Aquarius', '♓ Pisces'][Math.floor(normalized / 30) % 12];
    return `${degrees}° ${String(minutes).padStart(2, '0')}′ ${sign}`;
}

function updateUI(date) {
    document.getElementById('dateYear').textContent = date.getFullYear();
    document.getElementById('dateMonth').textContent = String(date.getMonth() + 1).padStart(2, '0');
    document.getElementById('dateDay').textContent = String(date.getDate()).padStart(2, '0');
    document.getElementById('timeHours').textContent = String(date.getHours()).padStart(2, '0');
    document.getElementById('timeMinutes').textContent = String(date.getMinutes()).padStart(2, '0');
    document.getElementById('timeSeconds').textContent = String(date.getSeconds()).padStart(2, '0');

    const ephemeris = getEphemerisState(date);
    document.getElementById('ephemerisText').textContent = `☉ ${formatLongitude(ephemeris.sunLon)} · ☽ ${formatLongitude(ephemeris.moonLon)}`;
}

function tick() {
    if (!isManualMode) {
        const now = Date.now();
        currentDate = new Date(currentDate.getTime() + (now - lastRealTime));
        lastRealTime = now;
    }
    updatePositions();
    requestAnimationFrame(tick);
}

function onResize() {
    size = Math.min(window.innerWidth, window.innerHeight) - 50;
    scale = size / 2;
    orbitRadius = scale * paddingOrbit;
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    orbit.setAttribute('cx', scale);
    orbit.setAttribute('cy', scale);
    orbit.setAttribute('r', orbitRadius);

    const nakshatraRadius = orbitRadius * 0.78;
    nakshatraOrbit.setAttribute('cx', scale);
    nakshatraOrbit.setAttribute('cy', scale);
    nakshatraOrbit.setAttribute('r', nakshatraRadius);

    boundaryLines.forEach((line, index) => {
        const angle = (index * 30 - 90) * Math.PI / 180;
        const innerRadius = orbitRadius * 0.78;
        const outerRadius = orbitRadius;
        line.setAttribute('x1', scale + innerRadius * Math.cos(angle));
        line.setAttribute('y1', scale + innerRadius * Math.sin(angle));
        line.setAttribute('x2', scale + outerRadius * Math.cos(angle));
        line.setAttribute('y2', scale + outerRadius * Math.sin(angle));
    });

    nakshatraBoundaryLines.forEach((line, index) => {
        const angle = (index * 360 / 27 - 90) * Math.PI / 180;
        const innerRadius = nakshatraRadius * 0.8;
        const outerRadius = nakshatraRadius;
        line.setAttribute('x1', scale + innerRadius * Math.cos(angle));
        line.setAttribute('y1', scale + innerRadius * Math.sin(angle));
        line.setAttribute('x2', scale + outerRadius * Math.cos(angle));
        line.setAttribute('y2', scale + outerRadius * Math.sin(angle));
    });

    nakshatraMarkers.forEach((marker, index) => {
        const angle = (index * 360 / 27 - 90) * Math.PI / 180;
        marker.setAttribute('cx', scale + nakshatraRadius * Math.cos(angle));
        marker.setAttribute('cy', scale + nakshatraRadius * Math.sin(angle));
        marker.setAttribute('r', Math.max(2, scale / 80));
    });

    const symbols = svg.querySelectorAll('.zodiac-symbol');
    symbols.forEach((symbol, index) => {
        const angle = (index * 30 - 90) * Math.PI / 180;
        symbol.setAttribute('x', scale + orbitRadius * Math.cos(angle));
        symbol.setAttribute('y', scale + orbitRadius * Math.sin(angle));
        symbol.setAttribute('font-size', scale / 10);
    });
    updatePositions();
}

window.addEventListener('resize', onResize);

const parts = [
    { id: 'dateYear', add: (date, value) => date.setFullYear(date.getFullYear() + value) },
    { id: 'dateMonth', add: (date, value) => date.setMonth(date.getMonth() + value) },
    { id: 'dateDay', add: (date, value) => date.setDate(date.getDate() + value) },
    { id: 'timeHours', add: (date, value) => date.setHours(date.getHours() + value) },
    { id: 'timeMinutes', add: (date, value) => date.setMinutes(date.getMinutes() + value) },
    { id: 'timeSeconds', add: (date, value) => date.setSeconds(date.getSeconds() + value) }
];

parts.forEach((part) => {
    document.getElementById(part.id).onwheel = (event) => {
        event.preventDefault();
        isManualMode = true;
        part.add(currentDate, event.deltaY > 0 ? -1 : 1);
        updatePositions();
        isManualMode = false;
    };
});

document.getElementById('resetButton').onclick = () => {
    currentDate = new Date();
    updatePositions();
};

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
        userLat = position.coords.latitude;
        userLon = position.coords.longitude;
        localStorage.setItem('savedLat', userLat);
        localStorage.setItem('savedLon', userLon);
        verifyAndCorrectEphemeris();
        updatePositions();
    });
}

onResize();
void verifyAndCorrectEphemeris();
tick();

function fnGetJulianDate(date) {
    let year = date.getUTCFullYear();
    let month = date.getUTCMonth() + 1;
    let day = date.getUTCDate();
    let hours = date.getUTCHours();
    let minutes = date.getUTCMinutes();
    let seconds = date.getUTCSeconds();

    if (month <= 2) {
        year -= 1;
        month += 12;
    }

    const a = Math.floor(year / 100);
    const b = 2 - a + Math.floor(a / 4);
    const jdDay = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
    const jdTime = hours / 24 + minutes / 1440 + seconds / 86400;
    return jdDay + jdTime;
}
