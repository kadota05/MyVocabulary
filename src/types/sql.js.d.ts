declare module 'sql.js' {
    export interface Database {
        run(sql: string, params?: any[] | Record<string, any>): void;
        exec(sql: string, params?: any[] | Record<string, any>): { columns: string[]; values: any[][] }[];
        export(): Uint8Array;
        close(): void;
        prepare(sql: string, params?: any[] | Record<string, any>): Statement;
    }

    export interface Statement {
        bind(values?: any[] | Record<string, any>): boolean;
        step(): boolean;
        get(params?: any[] | Record<string, any>): any[];
        getAsObject(params?: any[] | Record<string, any>): Record<string, any>;
        run(values?: any[] | Record<string, any>): void;
        reset(): void;
        free(): void;
    }

    export interface SqlJsStatic {
        Database: new (data?: Uint8Array) => Database;
    }

    export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}
