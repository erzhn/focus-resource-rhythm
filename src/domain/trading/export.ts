/**
 * Выгрузка журнала.
 *
 * Две тонкости CSV, из-за которых выгрузки обычно портятся:
 *
 * 1. Текст пользователя может начинаться с «=», «+», «-» или «@». Excel и
 *    Google Sheets воспринимают такую ячейку как формулу — это и приводит к
 *    подстановке чужих данных при открытии файла. Поэтому такие значения
 *    предваряются апострофом.
 * 2. Кириллица без BOM открывается в Excel крокозябрами. BOM добавляется.
 *
 * Пустое значение остаётся пустым: ноль вместо неизвестного риска исказил бы
 * любую последующую обработку так же, как исказил бы экран.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | null;
}

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

/** Экранирование одной ячейки. */
export function csvCell(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";

  // Опасный префикс нейтрализуем апострофом: он виден в ячейке, но не даёт
  // таблице выполнить содержимое как формулу.
  const safe = DANGEROUS_PREFIX.test(value) ? `'${value}` : value;

  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Строит CSV. Разделитель — точка с запятой: в русской локали Excel запятая
 * считается десятичным знаком, и файл с ней разъезжается по одной колонке.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => csvCell(c.header)).join(";");
  const body = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(";"));
  // BOM — чтобы Excel открыл кириллицу правильно.
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

/** Имя файла с датой выгрузки. */
export function exportFileName(prefix: string, extension: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}.${extension}`;
}

/** Версия схемы резервной выгрузки: по ней потом понятно, что именно внутри. */
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupEnvelope<T> {
  schemaVersion: number;
  exportedAt: string;
  account: { id: string; title: string; currency: string; timezone: string };
  data: T;
}

export function backup<T>(
  account: BackupEnvelope<T>["account"],
  data: T,
): BackupEnvelope<T> {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    account,
    data,
  };
}
