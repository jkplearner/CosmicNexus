const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;

const CONFIG = {
    galaxyScale: 120000,
    starCount: isMobile ? 40000 : 120000,
    solarSystemDistance: 45000,
    solarSystemScale: 1,
    sunSize: 12,
    inclination: 60,
    trailLength: isMobile ? 30 : 60,
    asteroidCount: isMobile ? 1000 : 5000,
    geometrySegments: isMobile ? 32 : 64,
    textureSize: isMobile ? 256 : 1024,
    antialias: !isMobile
};

export { CONFIG, isMobile };
export default CONFIG;
