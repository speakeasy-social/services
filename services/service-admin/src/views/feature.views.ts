import { createListView } from '@speakeasy-services/common';
import { UserFeature } from '../generated/prisma-client/index.js';
export type FeatureView = {
  did: string;
  key: string;
  value: string;
};

type FeatureSubset = Pick<UserFeature, 'userDid' | 'key' | 'value'>;

export function toFeatureView(feature: FeatureSubset): FeatureView {
  return {
    did: feature.userDid,
    key: feature.key,
    value: feature.value,
  };
}

/**
 * Create a list view that maps over the array
 */
export const toFeaturesListView = createListView<FeatureSubset, FeatureView>(
  toFeatureView,
);
