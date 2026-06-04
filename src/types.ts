export interface Equipment {
  id: string;
  key: string;
  title: string;
  description: string;
  image: string;
  url: string;
  isLoading?: boolean;
}

export interface Contender {
  id: string;
  key: string;
  title: string;
  description: string;
  image: string;
  url: string;
  equipment: Equipment[];
  notes: string;
  isWinner: boolean;
  isLoading?: boolean;
}

export interface Terrain {
  key: string;
  title: string;
  description: string;
  image: string;
  url: string;
}

export type Language = 'it' | 'en';
