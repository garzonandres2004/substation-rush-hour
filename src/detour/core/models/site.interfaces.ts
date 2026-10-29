import { IProvenance } from './provenance.interfaces';
import { SiteArchetypeKind } from './site.types';
import { TariffScheduleId } from './tariff.types';

export interface ISiteArchetype {
  id: string;
  kind: SiteArchetypeKind;
  name: string;
  description: string;
  scheduleId: TariffScheduleId;
  nominalPeakKw: number;
  seed: number;
  provenance: IProvenance;
}

export interface ISiteLoadInterval {
  startUtc: string;
  kw: number;
}
