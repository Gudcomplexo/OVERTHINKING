import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Languages, 
  RotateCcw, 
  Dices, 
  Trophy, 
  UserPlus, 
  RefreshCw, 
  BookOpen, 
  Sliders, 
  Plus, 
  Minus, 
  Edit3, 
  Sparkles, 
  MapPin, 
  BookmarkCheck,
  ShieldAlert,
  Search,
  Shuffle
} from 'lucide-react';
import { Contender, Equipment, Terrain, Language } from './types';
import { translations, questions, poolContenders, poolTerrains, poolEquipment } from './data';

// Custom helper: stable background/API fetcher for Wikipedia
const fetchWikiData = async (title: string, fallbackTitle: string | null, lang: Language) => {
  const getFirstMatch = async (keyword: string, targetLang: Language): Promise<string> => {
    try {
      const cleanText = keyword.replace(/_/g, ' ');
      // Use Wikipedia search API to find the top/first match of multiple entries
      const searchRes = await fetch(
        `https://${targetLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanText)}&format=json&origin=*`
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const firstHit = searchData?.query?.search?.[0];
        if (firstHit && firstHit.title) {
          return firstHit.title;
        }
      }
    } catch (err) {
      console.warn("Wikipedia search query failed:", err);
    }
    return keyword; // Fallbacked to raw key if search is empty or failed
  };

  try {
    const searchedTitle = await getFirstMatch(title, lang);
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchedTitle)}`);
    if (!res.ok) throw new Error("Wikipedia API error");
    const data = await res.json();
    return {
      title: data.title || title.replace(/_/g, ' '),
      description: data.extract || translations[lang].loadingError,
      image: data.thumbnail?.source || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300&auto=format&fit=crop",
      url: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(searchedTitle)}`
    };
  } catch (err) {
    if (fallbackTitle) {
      const fallbackLang = lang === 'it' ? 'en' : 'it';
      try {
        const searchedFallbackTitle = await getFirstMatch(fallbackTitle, fallbackLang);
        const res = await fetch(`https://${fallbackLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchedFallbackTitle)}`);
        if (res.ok) {
          const data = await res.json();
          return {
            title: data.title || fallbackTitle.replace(/_/g, ' '),
            description: data.extract || translations[lang].loadingError,
            image: data.thumbnail?.source || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300&auto=format&fit=crop",
            url: data.content_urls?.desktop?.page || `https://${fallbackLang}.wikipedia.org/wiki/${encodeURIComponent(searchedFallbackTitle)}`
          };
        }
      } catch (e) {
        // Fallback chain failure, return raw
      }
    }
    return {
      title: title.replace(/_/g, ' '),
      description: translations[lang].loadingError,
      image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300&auto=format&fit=crop",
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`
    };
  }
};

const getRandomUnique = (pool: string[], exclude: string[]): string => {
  const available = pool.filter(item => !exclude.includes(item));
  if (available.length === 0) return pool[Math.floor(Math.random() * pool.length)];
  return available[Math.floor(Math.random() * available.length)];
};

export default function App() {
  const [language, setLanguage] = useState<Language>('it');
  const [includeTerrain, setIncludeTerrain] = useState<boolean>(true);
  const [includeEquipment, setIncludeEquipment] = useState<boolean>(true);
  const [equipmentCount, setEquipmentCount] = useState<number>(1);
  const [totalRandomizer, setTotalRandomizer] = useState<boolean>(false);
  
  const [question, setQuestion] = useState<string>("Chi vincerebbe in uno scontro diretto?");
  const [isEditingQuestion, setIsEditingQuestion] = useState<boolean>(false);
  const [customQuestionInput, setCustomQuestionInput] = useState<string>("");

  const [terrain, setTerrain] = useState<Terrain | null>(null);
  const [terrainLoading, setTerrainLoading] = useState<boolean>(false);
  const [activeTerrainIndex, setActiveTerrainIndex] = useState<number | null>(null);

  const [contenders, setContenders] = useState<Contender[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [gameState, setGameState] = useState<'idle' | 'loading' | 'active'>('idle');

  const [aiWinnerId, setAiWinnerId] = useState<string | null>(null);
  const [aiMotivation, setAiMotivation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const clearAiVerdict = () => {
    setAiWinnerId(null);
    setAiMotivation(null);
    setAiError(null);
  };

  const handleRandomizeQuestion = () => {
    clearAiVerdict();
    const list = questions[language];
    const candidates = list.filter(q => q !== question);
    const activeList = candidates.length > 0 ? candidates : list;
    const randQ = activeList[Math.floor(Math.random() * activeList.length)];
    setQuestion(randQ);
  };

  const handleAiDecree = async () => {
    if (contenders.length < 2 || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiWinnerId(null);
    setAiMotivation(null);

    try {
      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contenders: contenders.map(c => ({
            id: c.id,
            title: c.title,
            description: c.description,
            notes: c.notes,
            equipment: c.equipment.map(eq => ({
              title: eq.title,
              description: eq.description,
            })),
          })),
          terrain: includeTerrain && terrain ? {
            title: terrain.title,
            description: terrain.description,
          } : null,
          question,
          language,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to analyze the battle.");
      }

      const data = await response.json();
      if (data.winnerId) {
        setAiWinnerId(data.winnerId);
        setAiMotivation(data.motivation);
        
        // Match winner ID or contender title to designate the winner!
        setContenders(prev => prev.map(c => ({
          ...c,
          isWinner: c.id === data.winnerId,
        })));
      } else {
        throw new Error("No winner declared by AI.");
      }
    } catch (err: any) {
      console.error("AI decree error:", err);
      setAiError(err.message || "Qualcosa è andato storto.");
    } finally {
      setAiLoading(false);
    }
  };

  const t = translations[language];

  // Total Randomizer Wiki prefetch cache
  const rfCache = useRef<{
    it: Array<{ title: string; description: string; image: string; url: string }>;
    en: Array<{ title: string; description: string; image: string; url: string }>;
  }>({ it: [], en: [] });
  const isPrefetching = useRef<boolean>(false);

  const replenishCache = useCallback(async (lang: Language) => {
    if (isPrefetching.current) return;
    isPrefetching.current = true;
    try {
      const batchSize = 10;
      const promises = Array.from({ length: batchSize }).map(async () => {
        try {
          const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/random/summary`, {
            headers: { 'Api-User-Agent': 'OverthinkingVS/1.0 (tagand33@gmail.com)' }
          });
          if (!res.ok) return null;
          const data = await res.json();
          if (data.type === 'disambiguation' || !data.title) return null;
          if (data.title.toLowerCase().includes('list of') || data.title.toLowerCase().includes('lista di')) return null;

          return {
            title: data.title,
            description: data.extract || translations[lang].loadingError,
            image: data.thumbnail?.source || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300&auto=format&fit=crop",
            url: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
            hasImage: !!data.thumbnail?.source
          };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(promises);
      const validResults = results.filter((item): item is NonNullable<typeof item> => item !== null);
      
      const withImages = validResults.filter(r => r.hasImage);
      const withoutImages = validResults.filter(r => !r.hasImage);
      const sortedQueue = [...withImages, ...withoutImages].map(({ title, description, image, url }) => ({
        title, description, image, url
      }));

      rfCache.current[lang] = [...rfCache.current[lang], ...sortedQueue];
    } catch (err) {
      console.warn("Failed to prefetch Wikipedia random summaries:", err);
    } finally {
      isPrefetching.current = false;
    }
  }, []);

  const popOrCreateRandomPages = useCallback(async (count: number, lang: Language) => {
    const popped: Array<{ title: string; description: string; image: string; url: string }> = [];

    while (popped.length < count && rfCache.current[lang].length > 0) {
      const item = rfCache.current[lang].shift();
      if (item) popped.push(item);
    }

    if (rfCache.current[lang].length < 8) {
      replenishCache(lang);
    }

    const needed = count - popped.length;
    if (needed > 0) {
      const promises = Array.from({ length: needed + 3 }).map(async () => {
        try {
          const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/random/summary`, {
            headers: { 'Api-User-Agent': 'OverthinkingVS/1.0 (tagand33@gmail.com)' }
          });
          if (!res.ok) return null;
          const data = await res.json();
          if (data.type === 'disambiguation' || !data.title) return null;
          return {
            title: data.title,
            description: data.extract || translations[lang].loadingError,
            image: data.thumbnail?.source || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=300&auto=format&fit=crop",
            url: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
          };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(promises);
      const valid = results.filter((x): x is NonNullable<typeof x> => x !== null);

      const added = valid.slice(0, needed);
      popped.push(...added);

      const leftovers = valid.slice(needed);
      if (leftovers.length > 0) {
        rfCache.current[lang].push(...leftovers);
      }
    }

    return popped;
  }, [replenishCache]);

  // Warm search pool cache
  useEffect(() => {
    replenishCache(language);
  }, [language, totalRandomizer, replenishCache]);

  // Instantly translates everything when the user switches languages
  useEffect(() => {
    const oldLang: Language = language === 'it' ? 'en' : 'it';
    const oldQuestions = questions[oldLang];
    const newQuestions = questions[language];
    
    // Translate the question if it's one of the presets
    const qIndex = oldQuestions.indexOf(question);
    if (qIndex !== -1) {
      setQuestion(newQuestions[qIndex]);
    }

    // Translate Terrain if active
    if (terrain) {
      setTerrainLoading(true);
      let selectedKey = terrain.key;
      let fallbackKey: string | null = null;
      if (activeTerrainIndex !== null) {
        const titleIT = poolTerrains.it[activeTerrainIndex];
        const titleEN = poolTerrains.en[activeTerrainIndex];
        selectedKey = language === 'it' ? titleIT : titleEN;
        fallbackKey = language === 'it' ? titleEN : titleIT;
      }

      fetchWikiData(selectedKey, fallbackKey, language).then(data => {
        setTerrain({
          key: selectedKey,
          title: data.title,
          description: data.description,
          image: data.image,
          url: data.url
        });
        setTerrainLoading(false);
      });
    }

    // Translate all contenders & their equipment simultaneously
    if (contenders.length > 0) {
      const oldContenderList = poolContenders[oldLang];
      const newContenderList = poolContenders[language];
      const oldEquipList = poolEquipment[oldLang];
      const newEquipList = poolEquipment[language];

      // Set temporary loaders
      setContenders(prev => prev.map(c => ({ ...c, isLoading: true })));

      Promise.all(contenders.map(async (c) => {
        const cIdx = oldContenderList.indexOf(c.key);
        const newCKey = cIdx !== -1 ? newContenderList[cIdx] : c.key;
        const fallbackCKey = cIdx !== -1 ? oldContenderList[cIdx] : null;

        const cData = await fetchWikiData(newCKey, fallbackCKey, language);

        const translatedEquipment = await Promise.all(c.equipment.map(async (eq) => {
          const eqIdx = oldEquipList.indexOf(eq.key);
          const newEqKey = eqIdx !== -1 ? newEquipList[eqIdx] : eq.key;
          const fallbackEqKey = eqIdx !== -1 ? oldEquipList[eqIdx] : null;

          const eqData = await fetchWikiData(newEqKey, fallbackEqKey, language);
          return {
            id: eq.id,
            key: newEqKey,
            title: eqData.title,
            description: eqData.description,
            image: eqData.image,
            url: eqData.url
          };
        }));

        return {
          ...c,
          key: newCKey,
          title: cData.title,
          description: cData.description,
          image: cData.image,
          url: cData.url,
          equipment: translatedEquipment,
          isLoading: false
        };
      })).then(results => {
        setContenders(results);
      });
    }
  }, [language]);

  // Generate a brand new challenge from scratch
  const startNewChallenge = async () => {
    setGameState('loading');
    setContenders([]);
    setTerrain(null);
    setAiWinnerId(null);
    setAiMotivation(null);
    setAiError(null);

    // 1. Pick a random question
    const list = questions[language];
    const randQ = list[Math.floor(Math.random() * list.length)];
    setQuestion(randQ);

    if (totalRandomizer) {
      let neededCount = 2; // two contenders
      if (includeTerrain) neededCount += 1;
      if (includeEquipment) neededCount += 2 * equipmentCount;

      try {
        setTerrainLoading(includeTerrain);
        const randomPages = await popOrCreateRandomPages(neededCount, language);
        let pageIdx = 0;

        // 2. Fetch Terrain
        if (includeTerrain) {
          const tItem = randomPages[pageIdx++];
          const selectedTerrainData: Terrain = {
            key: tItem.title,
            title: tItem.title,
            description: tItem.description,
            image: tItem.image,
            url: tItem.url
          };
          setTerrain(selectedTerrainData);
          setTerrainLoading(false);
        } else {
          setActiveTerrainIndex(null);
        }

        // 3. Assign Contenders
        const c1Item = randomPages[pageIdx++];
        const c2Item = randomPages[pageIdx++];

        const contender1: Contender = {
          id: '1',
          key: c1Item.title,
          title: c1Item.title,
          description: c1Item.description,
          image: c1Item.image,
          url: c1Item.url,
          equipment: [],
          notes: '',
          isWinner: false,
          isLoading: false
        };

        const contender2: Contender = {
          id: '2',
          key: c2Item.title,
          title: c2Item.title,
          description: c2Item.description,
          image: c2Item.image,
          url: c2Item.url,
          equipment: [],
          notes: '',
          isWinner: false,
          isLoading: false
        };

        if (includeEquipment) {
          for (let i = 0; i < equipmentCount; i++) {
            const eqItem = randomPages[pageIdx++];
            contender1.equipment.push({
              id: Math.random().toString(36).substring(2, 9),
              key: eqItem.title,
              title: eqItem.title,
              description: eqItem.description,
              image: eqItem.image,
              url: eqItem.url
            });
          }
          for (let i = 0; i < equipmentCount; i++) {
            const eqItem = randomPages[pageIdx++];
            contender2.equipment.push({
              id: Math.random().toString(36).substring(2, 9),
              key: eqItem.title,
              title: eqItem.title,
              description: eqItem.description,
              image: eqItem.image,
              url: eqItem.url
            });
          }
        }

        setActiveKeys([c1Item.title, c2Item.title]);
        setContenders([contender1, contender2]);
        setGameState('active');
      } catch (err) {
        console.error("Failed to generate Total Randomizer challenge:", err);
        setGameState('idle');
      }
      return;
    }

    // 2. Fetch Terrain (Normal mode)
    let selectedTerrainIdx: number | null = null;
    let selectedTerrainData: Terrain | null = null;
    
    if (includeTerrain) {
      setTerrainLoading(true);
      const randIdx = Math.floor(Math.random() * poolTerrains.it.length);
      selectedTerrainIdx = randIdx;
      setActiveTerrainIndex(randIdx);

      const titleIT = poolTerrains.it[randIdx];
      const titleEN = poolTerrains.en[randIdx];
      const selectedKey = language === 'it' ? titleIT : titleEN;
      const fallbackKey = language === 'it' ? titleEN : titleIT;

      const tData = await fetchWikiData(selectedKey, fallbackKey, language);
      selectedTerrainData = {
        key: selectedKey,
        title: tData.title,
        description: tData.description,
        image: tData.image,
        url: tData.url
      };
      setTerrain(selectedTerrainData);
      setTerrainLoading(false);
    } else {
      setActiveTerrainIndex(null);
    }

    // 3. Select 2 initial random contenders (Normal mode)
    const curContenders = poolContenders[language];
    const contender1Key = getRandomUnique(curContenders, []);
    const contender2Key = getRandomUnique(curContenders, [contender1Key]);
    const chosenKeys = [contender1Key, contender2Key];
    setActiveKeys(chosenKeys);

    // Prepare initial loaders
    const tempContenders: Contender[] = [
      {
        id: '1',
        key: contender1Key,
        title: '',
        description: '',
        image: '',
        url: '',
        equipment: [],
        notes: '',
        isWinner: false,
        isLoading: true
      },
      {
        id: '2',
        key: contender2Key,
        title: '',
        description: '',
        image: '',
        url: '',
        equipment: [],
        notes: '',
        isWinner: false,
        isLoading: true
      }
    ];
    setContenders(tempContenders);
    setGameState('active');

    // Fetch details in parallel
    const [c1, c2] = await Promise.all([
      fetchContenderDetailedWithEquipment(contender1Key, '1'),
      fetchContenderDetailedWithEquipment(contender2Key, '2')
    ]);

    setContenders([c1, c2]);
  };

  // Shared routine to generate and populate equipment
  const fetchContenderDetailedWithEquipment = async (key: string, id: string): Promise<Contender> => {
    const curContenders = poolContenders[language];
    const fallbackContenders = poolContenders[language === 'it' ? 'en' : 'it'];
    const idx = curContenders.indexOf(key);
    const fallbackKey = idx !== -1 ? fallbackContenders[idx] : null;

    const data = await fetchWikiData(key, fallbackKey, language);

    let equipmentList: Equipment[] = [];
    if (includeEquipment) {
      const curEquip = poolEquipment[language];
      const fallbackEquip = poolEquipment[language === 'it' ? 'en' : 'it'];
      
      const chosenEquipKeys: string[] = [];
      for (let i = 0; i < equipmentCount; i++) {
        const eq = getRandomUnique(curEquip, chosenEquipKeys);
        chosenEquipKeys.push(eq);
      }

      const eqResults = await Promise.all(
        chosenEquipKeys.map(async (eqKey) => {
          const eqIdx = curEquip.indexOf(eqKey);
          const fbEqKey = eqIdx !== -1 ? fallbackEquip[eqIdx] : null;
          const eqData = await fetchWikiData(eqKey, fbEqKey, language);
          return {
            id: Math.random().toString(36).substring(2, 9),
            key: eqKey,
            title: eqData.title,
            description: eqData.description,
            image: eqData.image,
            url: eqData.url
          };
        })
      );
      equipmentList = eqResults;
    }

    return {
      id,
      key,
      title: data.title,
      description: data.description,
      image: data.image,
      url: data.url,
      equipment: equipmentList,
      notes: '',
      isWinner: false,
      isLoading: false
    };
  };

  // Add an extra contender on demand
  const addExtraContender = async () => {
    const newId = (contenders.length + 1).toString();
    clearAiVerdict();
    
    if (totalRandomizer) {
      // Push skeleton
      setContenders(prev => [
        ...prev,
        {
          id: newId,
          key: '',
          title: '',
          description: '',
          image: '',
          url: '',
          equipment: [],
          notes: '',
          isWinner: false,
          isLoading: true
        }
      ]);

      try {
        let needed = 1;
        if (includeEquipment) needed += equipmentCount;
        const pages = await popOrCreateRandomPages(needed, language);
        let pIdx = 0;
        const cItem = pages[pIdx++];
        
        const extraContender: Contender = {
          id: newId,
          key: cItem.title,
          title: cItem.title,
          description: cItem.description,
          image: cItem.image,
          url: cItem.url,
          equipment: [],
          notes: '',
          isWinner: false,
          isLoading: false
        };

        if (includeEquipment) {
          for (let i = 0; i < equipmentCount; i++) {
            const eqItem = pages[pIdx++];
            extraContender.equipment.push({
              id: Math.random().toString(36).substring(2, 9),
              key: eqItem.title,
              title: eqItem.title,
              description: eqItem.description,
              image: eqItem.image,
              url: eqItem.url
            });
          }
        }

        setContenders(prev => prev.map(c => c.id === newId ? extraContender : c));
        setActiveKeys(prev => [...prev, cItem.title]);
      } catch (err) {
        console.error("Failed to add Total Randomizer extra contender:", err);
        // Remove skeleton
        setContenders(prev => prev.filter(c => c.id !== newId));
      }
      return;
    }

    const curContenders = poolContenders[language];
    // Pick unique key
    const newKey = getRandomUnique(curContenders, activeKeys);
    setActiveKeys(prev => [...prev, newKey]);

    // Push skeleton
    setContenders(prev => [
      ...prev,
      {
        id: newId,
        key: newKey,
        title: '',
        description: '',
        image: '',
        url: '',
        equipment: [],
        notes: '',
        isWinner: false,
        isLoading: true
      }
    ]);

    const detailed = await fetchContenderDetailedWithEquipment(newKey, newId);
    
    setContenders(prev => prev.map(c => c.id === newId ? detailed : c));
  };

  // Individual Reroll: Contender
  const rerollContender = async (id: string) => {
    setContenders(prev => prev.map(c => c.id === id ? { ...c, isLoading: true } : c));
    clearAiVerdict();
    
    if (totalRandomizer) {
      try {
        let needed = 1;
        if (includeEquipment) needed += equipmentCount;
        const pages = await popOrCreateRandomPages(needed, language);
        let pIdx = 0;
        const cItem = pages[pIdx++];

        const detailed: Contender = {
          id,
          key: cItem.title,
          title: cItem.title,
          description: cItem.description,
          image: cItem.image,
          url: cItem.url,
          equipment: [],
          notes: '',
          isWinner: false,
          isLoading: false
        };

        if (includeEquipment) {
          for (let i = 0; i < equipmentCount; i++) {
            const eqItem = pages[pIdx++];
            detailed.equipment.push({
              id: Math.random().toString(36).substring(2, 9),
              key: eqItem.title,
              title: eqItem.title,
              description: eqItem.description,
              image: eqItem.image,
              url: eqItem.url
            });
          }
        }

        setContenders(prev => prev.map(c => c.id === id ? detailed : c));
        setActiveKeys(prev => prev.map((k, index) => {
          const associatedContender = contenders[index];
          return associatedContender && associatedContender.id === id ? cItem.title : k;
        }));
      } catch (err) {
        console.error("Failed to reroll Total Randomizer contender:", err);
        setContenders(prev => prev.map(c => c.id === id ? { ...c, isLoading: false } : c));
      }
      return;
    }

    const curContenders = poolContenders[language];
    const currentActiveKeys = contenders.map(c => c.key);
    const newKey = getRandomUnique(curContenders, currentActiveKeys);

    // Update active key tracking
    setActiveKeys(prev => prev.map((k, index) => {
      const associatedContender = contenders[index];
      return associatedContender && associatedContender.id === id ? newKey : k;
    }));

    const detailed = await fetchContenderDetailedWithEquipment(newKey, id);
    
    setContenders(prev => prev.map(c => c.id === id ? detailed : c));
  };

  // Individual Reroll: Equipment
  const rerollEquipmentItem = async (contenderId: string, itemId: string) => {
    clearAiVerdict();
    // Put item in loading state
    setContenders(prev => prev.map(c => {
      if (c.id === contenderId) {
        return {
          ...c,
          equipment: c.equipment.map(eq => eq.id === itemId ? { ...eq, isLoading: true } : eq)
        };
      }
      return c;
    }));

    if (totalRandomizer) {
      try {
        const pages = await popOrCreateRandomPages(1, language);
        const item = pages[0];

        setContenders(prev => prev.map(c => {
          if (c.id === contenderId) {
            return {
              ...c,
              equipment: c.equipment.map(eq => eq.id === itemId ? {
                id: itemId,
                key: item.title,
                title: item.title,
                description: item.description,
                image: item.image,
                url: item.url,
                isLoading: false
              } : eq)
            };
          }
          return c;
        }));
      } catch (err) {
        console.error("Failed to reroll Total Randomizer equipment:", err);
        setContenders(prev => prev.map(c => {
          if (c.id === contenderId) {
            return {
              ...c,
              equipment: c.equipment.map(eq => eq.id === itemId ? { ...eq, isLoading: false } : eq)
            };
          }
          return c;
        }));
      }
      return;
    }

    const curEquip = poolEquipment[language];
    const fallbackEquip = poolEquipment[language === 'it' ? 'en' : 'it'];

    // Map currently equipped weapons on this specific contender to skip duplicates
    const currentContender = contenders.find(c => c.id === contenderId);
    const excludedEquips = currentContender ? currentContender.equipment.map(eq => eq.key) : [];

    const newEqKey = getRandomUnique(curEquip, excludedEquips);
    const eqIdx = curEquip.indexOf(newEqKey);
    const fbEqKey = eqIdx !== -1 ? fallbackEquip[eqIdx] : null;

    const eqData = await fetchWikiData(newEqKey, fbEqKey, language);

    setContenders(prev => prev.map(c => {
      if (c.id === contenderId) {
        return {
          ...c,
          equipment: c.equipment.map(eq => eq.id === itemId ? {
            id: itemId,
            key: newEqKey,
            title: eqData.title,
            description: eqData.description,
            image: eqData.image,
            url: eqData.url,
            isLoading: false
          } : eq)
        };
      }
      return c;
    }));
  };

  // Declare a contender as the supreme winner & swap/change opponents
  const declareWinnerHandler = async (id: string) => {
    const currentContenders = contenders;
    const winnerContender = currentContenders.find(c => c.id === id);
    if (!winnerContender) return;

    clearAiVerdict();

    const challengerIds = currentContenders.filter(c => c.id !== id).map(c => c.id);

    // Update active state of loaders to match the new keys
    setContenders(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, isWinner: true };
      } else {
        return {
          id: c.id,
          key: '',
          title: '',
          description: '',
          image: '',
          url: '',
          equipment: [],
          notes: '',
          isWinner: false,
          isLoading: true
        };
      }
    }));

    if (totalRandomizer) {
      try {
        const neededPagesCount = challengerIds.length * (1 + (includeEquipment ? equipmentCount : 0));
        const pages = await popOrCreateRandomPages(neededPagesCount, language);
        let pIdx = 0;

        const updatedContenders = currentContenders.map(c => {
          if (c.id === id) {
            return { ...c, isWinner: true };
          }
          const cItem = pages[pIdx++];
          const newContender: Contender = {
            id: c.id,
            key: cItem.title,
            title: cItem.title,
            description: cItem.description,
            image: cItem.image,
            url: cItem.url,
            equipment: [],
            notes: '',
            isWinner: false,
            isLoading: false
          };
          if (includeEquipment) {
            for (let i = 0; i < equipmentCount; i++) {
              const eqItem = pages[pIdx++];
              newContender.equipment.push({
                id: Math.random().toString(36).substring(2, 9),
                key: eqItem.title,
                title: eqItem.title,
                description: eqItem.description,
                image: eqItem.image,
                url: eqItem.url
              });
            }
          }
          return newContender;
        });

        setContenders(updatedContenders);
        setActiveKeys(() => {
          const nextKeys = updatedContenders.map(c => c.key);
          return nextKeys.filter(Boolean);
        });
      } catch (err) {
        console.error("Failed to swap challengers in Total Randomizer:", err);
        setContenders(prev => prev.map(c => c.id === id ? { ...c, isWinner: true } : { ...c, isLoading: false }));
      }
      return;
    }

    // Pick a new unique key for all other contenders using the correct pool length (Normal mode)
    const curContendersList = poolContenders[language];
    
    // We want the new keys to be unique, excluding:
    // - the winner's key
    // - are not currently duplicate
    let excludedKeys = [winnerContender.key];

    // Pick new keys
    const newChallengerKeys: Record<string, string> = {};
    challengerIds.forEach(cId => {
      const newKey = getRandomUnique(curContendersList, excludedKeys);
      newChallengerKeys[cId] = newKey;
      excludedKeys.push(newKey); // avoid picking this key for other challengers
    });

    // Update active state of loaders to match the new keys
    setContenders(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, isWinner: true };
      } else {
        return {
          id: c.id,
          key: newChallengerKeys[c.id],
          title: '',
          description: '',
          image: '',
          url: '',
          equipment: [],
          notes: '',
          isWinner: false,
          isLoading: true
        };
      }
    }));

    // Start loading the detailed parameters for the newly rolled challenger(s)
    const fetchPromises = challengerIds.map(async (cId) => {
      const key = newChallengerKeys[cId];
      const detailed = await fetchContenderDetailedWithEquipment(key, cId);
      return { id: cId, detailed };
    });

    try {
      const results = await Promise.all(fetchPromises);

      // Deep fill detailed challengers
      setContenders(prev => prev.map(c => {
        if (c.id === id) {
          return { ...c, isWinner: true };
        }
        const match = results.find(r => r.id === c.id);
        return match ? match.detailed : c;
      }));

      // Update activeKeys list
      setActiveKeys(() => {
        const nextKeys = currentContenders.map(c => c.id === id ? c.key : newChallengerKeys[c.id]);
        return nextKeys.filter(Boolean);
      });
    } catch (err) {
      console.error("Failed to generate replacement challenger:", err);
    }
  };

  // Handle live text edits for notes
  const updateContenderNotes = (id: string, text: string) => {
    setContenders(prev => prev.map(c => c.id === id ? { ...c, notes: text } : c));
  };

  // Individual Reroll: Terrain
  const rerollTerrain = async () => {
    if (!includeTerrain || terrainLoading) return;
    setTerrainLoading(true);
    clearAiVerdict();
    
    if (totalRandomizer) {
      try {
        const pages = await popOrCreateRandomPages(1, language);
        const item = pages[0];
        setTerrain({
          key: item.title,
          title: item.title,
          description: item.description,
          image: item.image,
          url: item.url
        });
      } catch (err) {
        console.error("Failed to reroll Total Randomizer terrain:", err);
      } finally {
        setTerrainLoading(false);
      }
      return;
    }

    const randIdx = Math.floor(Math.random() * poolTerrains.it.length);
    setActiveTerrainIndex(randIdx);

    const titleIT = poolTerrains.it[randIdx];
    const titleEN = poolTerrains.en[randIdx];
    const selectedKey = language === 'it' ? titleIT : titleEN;
    const fallbackKey = language === 'it' ? titleEN : titleIT;

    try {
      const tData = await fetchWikiData(selectedKey, fallbackKey, language);
      setTerrain({
        key: selectedKey,
        title: tData.title,
        description: tData.description,
        image: tData.image,
        url: tData.url
      });
    } catch (err) {
      console.error(err);
    } finally {
      setTerrainLoading(false);
    }
  };

  // Quick reset to clean slate
  const resetGame = () => {
    setContenders([]);
    setTerrain(null);
    setActiveTerrainIndex(null);
    setGameState('idle');
    setIncludeTerrain(true);
    setIncludeEquipment(true);
    setEquipmentCount(1);
    setTotalRandomizer(false);
    setQuestion("Chi vincerebbe in uno scontro diretto?");
    setIsEditingQuestion(false);
    setAiWinnerId(null);
    setAiMotivation(null);
    setAiLoading(false);
    setAiError(null);
  };

  return (
    <div className="relative min-h-screen font-sans overflow-x-hidden text-slate-100 flex flex-col items-center py-8 px-4 transition-colors duration-500 bg-slate-950">
      
      {/* Blurred Dynamic Background & Lights */}
      <div className="absolute inset-0 z-0 opacity-30 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-purple-900/40 to-slate-950"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-600 rounded-full blur-[120px]"></div>
      </div>
      
      {/* Immersive blurred background reflecting the active terrain */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center transition-all duration-1000 ease-in-out pointer-events-none opacity-40 scale-105"
        style={{ 
          backgroundImage: terrain?.image ? `url(${terrain.image})` : 'none',
          filter: 'blur(35px)'
        }} 
      />
      
      {/* Backdrop dark contrast filter cover */}
      <div className="fixed inset-0 z-0 bg-slate-950/70 pointer-events-none" />

      {/* Language Switch Rail Badge */}
      <div className="relative z-10 w-full max-w-6xl flex justify-between items-center mb-6">
        <div className="flex items-center gap-2 text-indigo-400 bg-indigo-950/40 border border-indigo-500/20 py-1.5 px-3 rounded-full text-xs font-semibold backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>Wikipedia Real-Time Sandbox</span>
        </div>
        
        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl shadow-lg shadow-black/40 backdrop-blur-md">
          <Languages className="w-4 h-4 text-slate-400 ml-1.5 mr-0.5" />
          <button 
            id="lang-it-btn"
            onClick={() => setLanguage('it')}
            className={`py-1 px-3 rounded-lg text-xs font-bold transition-all duration-200 ${language === 'it' ? 'bg-indigo-600 text-white shadow shadow-indigo-600/50' : 'text-slate-400 hover:text-white'}`}
          >
            🇮🇹 IT
          </button>
          <button 
            id="lang-en-btn"
            onClick={() => setLanguage('en')}
            className={`py-1 px-3 rounded-lg text-xs font-bold transition-all duration-200 ${language === 'en' ? 'bg-indigo-600 text-white shadow shadow-indigo-600/50' : 'text-slate-400 hover:text-white'}`}
          >
            🇬🇧 EN
          </button>
        </div>
      </div>

      {/* Main Header Presentation */}
      <header className="relative z-10 text-center mb-8 max-w-2xl px-2">
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-300">
          OVERTHINKING <span className="text-slate-400 font-light">{language === 'it' ? 'SFIDE VS' : 'VS CHALLENGES'}</span>
        </h1>
        <p className="mt-2.5 text-slate-400 text-sm md:text-base leading-relaxed">
          {t.subtitle}
        </p>
      </header>

      {/* Configurator Panel Container */}
      <div className="relative z-10 w-full max-w-4xl bg-slate-900/30 border border-slate-800/60 rounded-3xl p-6 mb-8 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2 mb-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
          <span>Configurazione Regole Sfida</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Options grid */}
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-3 cursor-pointer group text-slate-300 select-none hover:text-white transition-colors">
              <input 
                id="toggle-terrain-cb"
                type="checkbox" 
                checked={includeTerrain}
                onChange={(e) => setIncludeTerrain(e.target.checked)}
                className="w-5 h-5 rounded-md border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 accent-indigo-500 cursor-pointer"
              />
              <span className="text-sm font-semibold">{t.toggleTerrain}</span>
            </label>

            <div className="flex items-center gap-4 border-l border-slate-800 pl-6">
              <label className="flex items-center gap-3 cursor-pointer group text-slate-300 select-none hover:text-white transition-colors">
                <input 
                  id="toggle-equipment-cb"
                  type="checkbox" 
                  checked={includeEquipment}
                  onChange={(e) => setIncludeEquipment(e.target.checked)}
                  className="w-5 h-5 rounded-md border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 accent-indigo-500 cursor-pointer"
                />
                <span className="text-sm font-semibold">{t.toggleEquip}</span>
              </label>

              {/* Counter controller - active optionally */}
              <AnimatePresence>
                {includeEquipment && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, x: -10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: -10 }}
                    className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg p-1"
                  >
                    <button 
                      id="minus-equip-btn"
                      onClick={() => setEquipmentCount(prev => Math.max(1, prev - 1))}
                      disabled={equipmentCount <= 1}
                      className="w-7 h-7 rounded-md flex items-center justify-center bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-40 disabled:pointer-events-none transition-all"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span id="equip-count-val" className="w-8 text-center text-xs font-black text-indigo-400">
                      {equipmentCount}
                    </span>
                    <button 
                      id="plus-equip-btn"
                      onClick={() => setEquipmentCount(prev => Math.min(3, prev + 1))}
                      disabled={equipmentCount >= 3}
                      className="w-7 h-7 rounded-md flex items-center justify-center bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-40 disabled:pointer-events-none transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-4 border-l border-slate-800 pl-6">
              <label 
                className="flex items-center gap-3 cursor-pointer group text-slate-300 select-none hover:text-white transition-colors"
                title={t.randomizerTooltip}
              >
                <input 
                  id="toggle-randomizer-cb"
                  type="checkbox" 
                  checked={totalRandomizer}
                  onChange={(e) => setTotalRandomizer(e.target.checked)}
                  className="w-5 h-5 rounded-md border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500 default-focus accent-amber-500 cursor-pointer"
                />
                <span className="text-sm font-semibold flex items-center gap-1">
                  {t.toggleRandomizer}
                </span>
              </label>
            </div>
          </div>

          {/* Action trigger group */}
          <div className="flex flex-wrap gap-2.5">
            <button 
              id="generate-btn"
              onClick={startNewChallenge}
              className="relative overflow-hidden flex items-center gap-2 max-md:w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-sm py-3 px-6 rounded-xl hover:shadow-lg hover:shadow-indigo-500/20 active:translate-y-0.5 cursor-pointer transition-all duration-200 shadow-lg shadow-indigo-500/20"
            >
              <Dices className="w-4 h-4 text-indigo-200" />
              <span>{t.btnGenerate}</span>
            </button>

            {gameState === 'active' && (
              <button 
                id="ai-decree-btn"
                onClick={handleAiDecree}
                disabled={aiLoading || contenders.some(c => c.isLoading)}
                className="relative overflow-hidden flex items-center justify-center gap-2 max-md:w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-slate-800 disabled:to-slate-800 text-white disabled:text-slate-500 font-extrabold text-sm py-3 px-5 rounded-xl hover:shadow-lg hover:shadow-amber-500/10 active:translate-y-0.5 cursor-pointer transition-all duration-200 shadow-md border border-amber-500/10 disabled:border-transparent"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-amber-200 animate-spin" />
                    <span>{t.aiWinnerLoading}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
                    <span>{t.btnAiWinner}</span>
                  </>
                )}
              </button>
            )}

            <button 
              id="add-contender-btn"
              onClick={addExtraContender}
              disabled={gameState !== 'active'}
              className="flex items-center justify-center gap-2 max-md:w-full bg-slate-800 border border-slate-700 text-slate-200 font-bold text-sm py-3 px-5 rounded-xl hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>{t.btnAdd}</span>
            </button>

            <button 
              id="reset-btn"
              onClick={resetGame}
              className="flex items-center justify-center gap-2 max-md:w-full border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300 font-bold text-sm py-3 px-4 rounded-xl transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t.btnReset}</span>
            </button>
          </div>
        </div>
      </div>

      {gameState !== 'idle' && (
        <div className="relative z-10 w-full max-w-6xl flex flex-col items-center">
          
          {/* Main Battle Challenge Question Container */}
          <div className="w-full flex justify-center mb-8 px-2">
            <div className="w-full max-w-2xl bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 text-center backdrop-blur-sm shadow-xl relative group">
              <div className="flex items-center justify-between mb-3 border-b border-slate-700/30 pb-2">
                <div className="text-[10px] text-indigo-400/80 uppercase tracking-[0.2em] font-black">
                  {language === 'it' ? 'DOMANDA DI CONFRONTO' : 'COMPARISON QUESTION'}
                </div>
                {!isEditingQuestion && (
                  <button
                    id="randomize-question-btn"
                    onClick={handleRandomizeQuestion}
                    title={t.randomQuestionTooltip}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold text-indigo-400 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md transition-all duration-150 cursor-pointer border border-indigo-400/20"
                  >
                    <Shuffle className="w-3 h-3 text-indigo-400" />
                    <span>{t.btnRandomQuestion}</span>
                  </button>
                )}
              </div>
              <AnimatePresence mode="wait">
                {!isEditingQuestion ? (
                  <motion.p 
                    id="displayed-question"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    onClick={() => {
                      setCustomQuestionInput(question);
                      setIsEditingQuestion(true);
                    }}
                    className="text-xl font-extrabold text-slate-100 hover:text-indigo-300 cursor-text transition-colors"
                  >
                    "{question}"
                  </motion.p>
                ) : (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="flex items-center justify-center gap-2"
                  >
                    <input 
                      id="question-edit-input"
                      type="text"
                      value={customQuestionInput}
                      onChange={(e) => setCustomQuestionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (customQuestionInput.trim()) setQuestion(customQuestionInput);
                          setIsEditingQuestion(false);
                        }
                      }}
                      className="bg-slate-900 border border-indigo-500 rounded-xl px-4 py-1.5 text-base font-medium text-white outline-none focus:ring-2 focus:ring-indigo-500/20 text-center w-full max-w-md"
                      autoFocus
                    />
                    <button 
                      id="question-save-btn"
                      onClick={() => {
                        if (customQuestionInput.trim()) setQuestion(customQuestionInput);
                        setIsEditingQuestion(false);
                      }}
                      className="bg-indigo-600 text-white font-bold rounded-xl px-3.5 py-1.5 hover:bg-indigo-500 text-xs transition-colors shrink-0"
                    >
                      <BookmarkCheck className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <div id="edit-hint-label" className="text-[10px] text-slate-500 mt-2 italic">
                {t.editHint}
              </div>
            </div>
          </div>

          {/* AI Verdict section */}
          <AnimatePresence>
            {(aiLoading || aiWinnerId || aiError) && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="w-full max-w-2xl mb-8 px-2"
              >
                <div className="relative overflow-hidden bg-gradient-to-br from-amber-950/20 via-slate-900/90 to-amber-950/10 border border-amber-500/40 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
                  {/* Decorative glowing backdrops */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl" />

                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
                    <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                      {t.aiExplainTitle}
                    </span>
                  </div>

                  {aiLoading ? (
                    <div className="flex items-center gap-3 py-4 text-slate-300">
                      <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
                      <p className="text-sm font-semibold tracking-wide animate-pulse">
                        {t.aiWinnerLoading}
                      </p>
                    </div>
                  ) : aiError ? (
                    <div className="flex items-center gap-3 py-3 text-red-400">
                      <ShieldAlert className="w-5 h-5 shrink-0" />
                      <p className="text-sm font-semibold">{aiError}</p>
                    </div>
                  ) : (
                    <div>
                      {aiWinnerId && (
                        <div className="mb-2 text-xs font-medium text-slate-400">
                          {language === 'it' 
                            ? `Combattante decretato vincitore dall'I.A.:` 
                            : `Fighter decreed as winner by A.I.:`}{' '}
                          <span className="text-amber-400 font-extrabold uppercase">
                            {contenders.find(c => c.id === aiWinnerId)?.title || `Contendente #${aiWinnerId}`}
                          </span>
                        </div>
                      )}
                      <p className="text-base font-medium text-amber-200/90 leading-relaxed italic">
                        "{aiMotivation}"
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Terrain Card Display Component */}
          {includeTerrain && (
            <div id="terrain-display-section" className="w-full max-w-3xl mb-10 px-2">
              {terrainLoading ? (
                <div className="w-full bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-center gap-4 animate-pulse">
                  <div className="w-24 h-24 rounded-lg bg-slate-800/80 shrink-0" />
                  <div className="flex-1 w-full space-y-2">
                    <div className="h-4 bg-slate-800/80 rounded w-1/4" />
                    <div className="h-3 bg-slate-800/80 rounded w-full" />
                    <div className="h-3 bg-slate-800/80 rounded w-5/6" />
                  </div>
                </div>
              ) : (
                terrain && (
                  <motion.div 
                    id="active-terrain-card"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="w-full flex flex-col sm:flex-row items-center gap-4 bg-gradient-to-r from-slate-900/80 to-indigo-900/40 border border-indigo-500/30 rounded-xl p-3 shadow-2xl backdrop-blur-md"
                  >
                    <div className="w-24 h-24 rounded-lg overflow-hidden shrink-0 border border-white/10 shadow-inner relative group">
                      <img 
                        id="terrain-img-el"
                        src={terrain.image} 
                        alt={terrain.title} 
                        className="w-full h-full object-cover transform scale-100 hover:scale-110 transition-all duration-500"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          {t.terrainTitle}
                        </span>
                        <a 
                          id="terrain-wiki-btn"
                          href={terrain.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-xs text-slate-500 hover:text-indigo-400 inline-flex items-center"
                          title="Fondata su Wikipedia"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                        </a>
                        <button 
                          id="terrain-reroll-btn"
                          onClick={rerollTerrain}
                          disabled={terrainLoading}
                          className="text-xs text-slate-500 hover:text-rose-400 inline-flex items-center cursor-pointer transition-colors"
                          title={language === 'it' ? 'Cambia Terreno' : 'Reroll Terrain'}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${terrainLoading ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                      <h3 id="terrain-title-el" className="text-lg font-bold text-slate-100">
                        {terrain.title}
                      </h3>
                      <p id="terrain-desc-el" className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                        {terrain.description}
                      </p>
                    </div>
                  </motion.div>
                )
              )}
            </div>
          )}

          {/* Grid of contenders */}
          <div 
            id="contenders" 
            className={`grid gap-8 w-full mb-16 items-stretch justify-center ${
              contenders.length === 1 
                ? 'grid-cols-1 max-w-xl mx-auto' 
                : contenders.length === 2 
                  ? 'grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto' 
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto'
            }`}
          >
            <AnimatePresence mode="popLayout">
               {contenders.map((contender) => {
                if (contender.isLoading) {
                  return (
                    <div 
                      key={`skeleton-${contender.id}`}
                      className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 flex flex-col space-y-4 animate-pulse min-h-[550px]"
                    >
                      <div className="h-6 bg-slate-800 rounded w-2/3 mx-auto" />
                      <div className="h-64 bg-slate-800 rounded-2xl w-full" />
                      <div className="space-y-2">
                        <div className="h-4 bg-slate-800 rounded w-full" />
                        <div className="h-4 bg-slate-800 rounded w-5/6" />
                      </div>
                      <div className="mt-auto pt-6 border-t border-slate-800 space-y-2">
                        <div className="h-10 bg-slate-800 rounded-lg w-full" />
                      </div>
                    </div>
                  );
                }

                return (
                  <motion.div
                    key={contender.id}
                    layoutId={`contender-layout-${contender.id}`}
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                    className={`relative flex flex-col justify-between bg-slate-900/80 border rounded-3xl p-6 shadow-2xl backdrop-blur-md select-none transition-all duration-300 md:min-h-[580px] ${
                      contender.isWinner 
                        ? 'border-amber-500/55 shadow-2xl shadow-yellow-500/10 scale-[1.01] ring-1 ring-amber-550/20' 
                        : 'border-slate-800 hover:border-slate-700/80'
                    }`}
                  >
                    
                    {/* Top Status absolute Badge */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-25">
                      <div className={`px-4 py-1 text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg ${
                        contender.isWinner 
                          ? 'bg-amber-500 text-slate-950 shadow-amber-500/30' 
                          : 'bg-indigo-600 text-white shadow-indigo-500/30'
                      }`}>
                        {contender.isWinner ? `${t.winnerBadge} 👑` : `${language === 'it' ? 'Sfidante' : 'Challenger'} ⚔️`}
                      </div>
                    </div>

                    <div className="flex flex-col flex-1">
                      {/* Character Title Card Header */}
                      <div className="flex items-center justify-between gap-2 mt-2 mb-3">
                        <h2 className="text-xl font-black text-slate-100 tracking-tight line-clamp-1">
                          {contender.title}
                        </h2>
                        
                        <div className="flex items-center gap-1 shrink-0">
                          <button 
                            onClick={() => rerollContender(contender.id)}
                            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-red-650 hover:text-white flex items-center justify-center text-slate-400 cursor-pointer transition-all duration-200 border border-slate-705"
                            title={t.rerollTooltip}
                          >
                            <RefreshCw className="w-3" />
                          </button>
                          
                          <a 
                            href={contender.url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-indigo-600 hover:text-white flex items-center justify-center text-slate-400 transition-all duration-200 border border-slate-705"
                            title="Apri Wikipedia"
                          >
                            <BookOpen className="w-3" />
                          </a>
                        </div>
                      </div>

                      {/* Character image representation - Enlarged height */}
                      <div className="h-64 bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl overflow-hidden relative border border-white/10 mb-4 shrink-0 shadow-inner group">
                        <img 
                          src={contender.image} 
                          alt={contender.title} 
                          className="w-full h-full object-cover transform scale-100 group-hover:scale-105 duration-500 ease-out"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* Short character details extract */}
                      <p className="text-slate-300 text-xs leading-relaxed mb-4 line-clamp-3 font-normal">
                        {contender.description}
                      </p>

                      {/* Optional equipment array section */}
                      {includeEquipment && contender.equipment.length > 0 && (
                        <div className="flex flex-col gap-2 mb-4 flex-1">
                          {contender.equipment.map((item) => (
                            <div 
                              key={item.id} 
                              className={`flex items-center gap-3 p-2 bg-slate-950/50 border border-dashed border-slate-800/80 rounded-xl relative ${item.isLoading ? 'opacity-40 animate-pulse' : ''}`}
                            >
                              <img 
                                src={item.image} 
                                alt={item.title} 
                                className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-800 bg-indigo-500/10"
                                referrerPolicy="no-referrer"
                              />
                              <div className="flex-1 min-w-0 pr-10">
                                <span className="block text-[8px] font-bold text-indigo-400 uppercase tracking-wider">
                                  {language === 'it' ? 'Equipaggiamento' : 'Equipment'}
                                </span>
                                <h5 className="font-extrabold text-xs text-slate-100 truncate">
                                  {item.title}
                                </h5>
                                <p className="text-[10px] text-slate-500 truncate" title={item.description}>
                                  {item.description}
                                </p>
                              </div>

                              {/* Tools & refresh logic for current item */}
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                <button 
                                  onClick={() => rerollEquipmentItem(contender.id, item.id)}
                                  className="w-6 h-6 rounded-full bg-slate-900 border border-slate-850 hover:bg-rose-600 hover:text-white flex items-center justify-center text-slate-500 transition-all cursor-pointer"
                                  title={t.rerollTooltip}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                                
                                <a 
                                  href={item.url} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="w-6 h-6 rounded-full bg-slate-900 border border-slate-850 hover:bg-indigo-600 hover:text-white flex items-center justify-center text-slate-500 transition-all text-xs"
                                  title="Wiki"
                                >
                                  <BookOpen className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Character custom tactical details */}
                      <div className="mb-4">
                        <textarea 
                          id={`notes-${contender.id}`}
                          value={contender.notes}
                          onChange={(e) => updateContenderNotes(contender.id, e.target.value)}
                          placeholder={t.notesPlaceholder}
                          className="w-full h-16 bg-slate-950/50 border border-slate-800/80 rounded-xl p-2.5 text-xs text-slate-305 placeholder-slate-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                      </div>
                    </div>

                    {/* Choose winner submission trigger */}
                    <div className="mt-auto">
                      <button 
                        id={`winner-btn-${contender.id}`}
                        onClick={() => declareWinnerHandler(contender.id)}
                        className={`w-full py-3 font-black text-xs rounded-xl uppercase tracking-tighter shadow-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
                          contender.isWinner 
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20' 
                            : 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/20'
                        }`}
                      >
                        {contender.isWinner ? (
                          <>
                            <Trophy className="w-3.5 h-3.5 text-slate-950" />
                            <span>{t.winnerBtnText}</span>
                          </>
                        ) : (
                          <span>{t.btnWinner}</span>
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}

            </AnimatePresence>
          </div>



        </div>
      )}

      {/* Footer credits design line */}
      <footer className="relative z-10 w-full max-w-4xl text-center border-t border-slate-800/60 pt-6 mt-auto text-xs text-slate-500/85 font-medium">
        <span>Overthinking VS Game Studio © {new Date().getFullYear()} — Powered by Wikipedia API realtime summaries</span>
      </footer>

    </div>
  );
}
