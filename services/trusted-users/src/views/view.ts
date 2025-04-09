/**
 * Creates a view function that picks specified attributes from a model
 * and optionally transforms their values
 */
export function createView<T extends object, V extends object>(
  pick: (keyof T)[],
  transform?: Partial<{
    [K in keyof T]: (value: T[K]) => unknown;
  }>,
) {
  return (model: T): V => {
    const view = {} as V;

    for (const key of pick) {
      const value = model[key];
      const transformed = transform?.[key]?.(value) ?? value;
      (view as any)[key] = transformed;
    }

    return view;
  };
}

/**
 * Creates a view function for an array of models
 */
export function createListView<T extends object, V extends object>(
  view: (model: T) => V,
) {
  return (models: T[]): V[] => {
    return models.map(view);
  };
}
