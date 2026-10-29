import { ProvenanceKind } from './provenance.types';

export interface IProvenance {
  id: string;
  label: string;
  kind: ProvenanceKind;
  url: string;
  seriesId?: string;
  note?: string;
}
