// championData.ts
// Data Dragon integration for fetching champion data

export interface Champion {
  id: string;
  key: string;
  name: string;
  title: string;
  image: {
    full: string;
    sprite: string;
  };
}

export interface ChampionData {
  [championId: string]: Champion;
}

let cachedChampionData: ChampionData | null = null;
let cachedVersion: string | null = null;
let loadingPromise: Promise<ChampionData> | null = null;

/**
 * Gets the latest Data Dragon version
 */
async function getLatestVersion(): Promise<string> {
  try {
    const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions: string[] = await response.json();
    return versions[0]; // Latest version is first
  } catch (error) {
    console.error('Failed to fetch Data Dragon version:', error);
    throw error;
  }
}

/**
 * Fetches champion data from Data Dragon
 */
async function fetchChampionData(version: string): Promise<ChampionData> {
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Failed to fetch champion data:', error);
    throw error;
  }
}

/**
 * Gets champion data, using cache if available
 */
export async function getChampionData(): Promise<ChampionData> {
  // Return cached data if available
  if (cachedChampionData && cachedVersion) {
    return cachedChampionData;
  }

  // If already loading, wait for that promise
  if (loadingPromise) {
    return loadingPromise;
  }

  // Start loading
  loadingPromise = (async () => {
    try {
      const version = await getLatestVersion();
      const data = await fetchChampionData(version);
      
      cachedChampionData = data;
      cachedVersion = version;
      loadingPromise = null;
      
      return data;
    } catch (error) {
      loadingPromise = null;
      throw error;
    }
  })();

  return loadingPromise;
}

/**
 * Gets a champion by ID (numeric ID used by LCU)
 */
export async function getChampionById(championId: number): Promise<Champion | null> {
  const data = await getChampionData();
  
  // Find champion by key (which is the numeric ID as string)
  const championKey = championId.toString();
  
  for (const [, champion] of Object.entries(data)) {
    if (champion.key === championKey) {
      return champion;
    }
  }
  
  return null;
}

/**
 * Gets champion image URL (deprecated - use getChampionImageUrlById instead)
 */
export async function getChampionImageUrl(championId: number, version?: string): Promise<string> {
  const champion = await getChampionById(championId);
  if (!champion) {
    return '';
  }
  const v = version || cachedVersion || 'latest';
  return `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${champion.id}.png`;
}

// Remove unused function parameter warning by using it
export function _unused() {
  // This function is intentionally empty to avoid unused parameter warnings
}

/**
 * Gets champion image URL by champion key
 */
export async function getChampionImageUrlByKey(championKey: string, version?: string): Promise<string> {
  const data = await getChampionData();
  const champion = data[championKey];
  
  if (!champion) {
    return '';
  }
  
  const v = version || cachedVersion || 'latest';
  return `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${champion.id}.png`;
}

/**
 * Gets champion image URL by numeric ID
 */
export async function getChampionImageUrlById(championId: number, version?: string): Promise<string> {
  const champion = await getChampionById(championId);
  
  if (!champion) {
    return '';
  }
  
  const v = version || cachedVersion || 'latest';
  return `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${champion.id}.png`;
}


/**
 * Gets all champions as an array
 */
export async function getAllChampions(): Promise<Champion[]> {
  const data = await getChampionData();
  return Object.values(data);
}

/**
 * Searches champions by name
 */
export async function searchChampions(query: string): Promise<Champion[]> {
  const champions = await getAllChampions();
  const lowerQuery = query.toLowerCase();
  
  return champions.filter(champion => 
    champion.name.toLowerCase().includes(lowerQuery) ||
    champion.title.toLowerCase().includes(lowerQuery) ||
    champion.id.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Clears the cache (useful for testing or forcing refresh)
 */
export function clearCache(): void {
  cachedChampionData = null;
  cachedVersion = null;
  loadingPromise = null;
}

