/** The only thing another module may import from `config/`. Exactly HLD-03 §4's `contract.get(key)`. */
export interface ConfigPublicContract {
  get(key: string): Promise<string>;
}
