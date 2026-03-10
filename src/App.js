import { BlobReader, BlobWriter, TextWriter, ZipReader } from '@zip.js/zip.js';
import { useEffect, useMemo, useRef, useState } from 'react';

const SHOW_IMAGES_BETA = false;
const BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

const SUBQUESTION_ORDER = {
  '': 0,
  intro: 1,
  a: 2,
  b: 3,
  c: 4,
  d: 5,
  e: 6,
  f: 7,
  g: 8,
  h: 9,
  i: 10,
  j: 11,
  k: 12,
  l: 13,
  m: 14,
  n: 15,
  o: 16,
  p: 17,
  q: 18,
  r: 19,
  s: 20,
  t: 21,
  u: 22,
  v: 23,
  w: 24,
  x: 25,
  y: 26,
  z: 27,
};

function normalizeSubquestion(value) {
  if (value == null) {
    return '';
  }

  return String(value).toLowerCase();
}

function normalizeZipPath(pathValue) {
  return String(pathValue || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .trim();
}

function toSortValue(value) {
  const number = Number(value);
  return Number.isNaN(number) ? String(value) : number;
}

function compareRows(a, b) {
  const sourceCompare = String(a.source || '').localeCompare(String(b.source || ''));
  if (sourceCompare !== 0) {
    return sourceCompare;
  }

  const yearCompare = toSortValue(a.year) - toSortValue(b.year);
  if (yearCompare !== 0) {
    return yearCompare;
  }

  const sectionCompare = String(a.section || '').localeCompare(String(b.section || ''));
  if (sectionCompare !== 0) {
    return sectionCompare;
  }

  const questionCompare = toSortValue(a.question_number) - toSortValue(b.question_number);
  if (questionCompare !== 0) {
    return questionCompare;
  }

  const leftSub = normalizeSubquestion(a.subquestion);
  const rightSub = normalizeSubquestion(b.subquestion);

  const leftOrder = SUBQUESTION_ORDER[leftSub] ?? 1000;
  const rightOrder = SUBQUESTION_ORDER[rightSub] ?? 1000;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return leftSub.localeCompare(rightSub);
}

function uniqueSortedValues(rows, key) {
  const values = Array.from(new Set(rows.map((row) => row[key]).filter(Boolean)));
  return values.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function isSectionB(sectionValue) {
  return String(sectionValue || '').toLowerCase().includes('section b');
}

function normalizeBasePath(pathValue) {
  const value = String(pathValue || '');
  if (!value || value === '/') {
    return '';
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function withBasePath(pathValue) {
  const path = String(pathValue || '');
  if (!path) {
    return BASE_PATH || '';
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalizedPath}`;
}

function toPublicPath(pathValue) {
  if (!pathValue) {
    return '';
  }

  return withBasePath(pathValue);
}

function getShowRows(selectedRow, allRows) {
  if (!selectedRow) {
    return [];
  }

  if (!isSectionB(selectedRow.section)) {
    return [selectedRow];
  }

  return allRows
    .filter((row) => {
      return (
        row.exam_folder === selectedRow.exam_folder
        && row.section === selectedRow.section
        && String(row.question_number) === String(selectedRow.question_number)
      );
    })
    .sort(compareRows);
}

function normalizeSubjectTaxonomy(rawSubject) {
  if (!rawSubject || typeof rawSubject !== 'object') {
    return null;
  }

  const token = String(rawSubject.token || '').toUpperCase();
  const name = String(rawSubject.name || token || 'Unknown subject');

  if (!token) {
    return null;
  }

  return {
    token,
    name,
    group: String(rawSubject.group || 'Other'),
    aliases: Array.isArray(rawSubject.aliases)
      ? rawSubject.aliases.map((alias) => String(alias).toUpperCase())
      : [],
    taxonomy: rawSubject.taxonomy || { aos: [], topics: [] },
  };
}

function getTokenFromExamFolder(examFolder) {
  const parts = String(examFolder || '').split('_').filter(Boolean);

  if (parts.length < 3) {
    return '';
  }

  const lastPart = parts[parts.length - 1];
  if (!/^\d{4}$/.test(lastPart)) {
    return '';
  }

  return String(parts[parts.length - 2] || '').toUpperCase();
}

function resolveRowSubjectToken(row, tokenToCanonical) {
  const examFolder = String(row?.exam_folder || '');
  const folderToken = getTokenFromExamFolder(examFolder);

  if (folderToken && tokenToCanonical[folderToken]) {
    return tokenToCanonical[folderToken];
  }

  const upper = examFolder.toUpperCase();
  for (const token of Object.keys(tokenToCanonical)) {
    if (upper.includes(`_${token}_`)) {
      return tokenToCanonical[token];
    }
  }

  return '';
}

function buildTaxonomyMaps(subject) {
  const aosById = {};
  const topicById = {};

  for (const aos of subject?.taxonomy?.aos || []) {
    aosById[aos.id] = aos;
  }

  for (const topic of subject?.taxonomy?.topics || []) {
    topicById[topic.id] = topic;
  }

  return { aosById, topicById };
}

function formatAosLabel(aosId) {
  const match = String(aosId || '').match(/^(\d+)\.(\d+)$/);

  if (!match) {
    return String(aosId || 'Unknown');
  }

  return `U${match[1]} AOS${match[2]}`;
}

function getMajorQuestionKey(row) {
  return [row?.exam_folder || '', row?.section || '', row?.question_number || ''].join('__');
}

function App() {
  const [subjects, setSubjects] = useState([]);
  const [subjectCatalogLoading, setSubjectCatalogLoading] = useState(true);
  const [selectedSubjectToken, setSelectedSubjectToken] = useState('');

  const [allRows, setAllRows] = useState([]);
  const [defaultRows, setDefaultRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [datasetError, setDatasetError] = useState('');
  const [selectedRowId, setSelectedRowId] = useState('');

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [aosFilter, setAosFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');

  const [datasetMode, setDatasetMode] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetFileName, setDatasetFileName] = useState('');
  const [datasetMetadata, setDatasetMetadata] = useState(null);
  const [datasetAssetUrls, setDatasetAssetUrls] = useState({});

  const fileInputRef = useRef(null);
  const zipReaderRef = useRef(null);
  const zipEntryMapRef = useRef(new Map());
  const zipSuffixCacheRef = useRef(new Map());
  const datasetAssetUrlMapRef = useRef(new Map());
  const pendingAssetLoadsRef = useRef(new Map());

  const showImagesMode = SHOW_IMAGES_BETA || datasetMode;
  const datasetTitle = String(datasetMetadata?.title || datasetFileName || 'Uploaded dataset');
  const datasetDescription = String(datasetMetadata?.description || '');

  function clearDatasetAssetUrls() {
    for (const url of datasetAssetUrlMapRef.current.values()) {
      URL.revokeObjectURL(url);
    }

    datasetAssetUrlMapRef.current.clear();
    pendingAssetLoadsRef.current.clear();
    setDatasetAssetUrls({});
  }

  async function closeCurrentReader() {
    if (!zipReaderRef.current) {
      return;
    }

    const currentReader = zipReaderRef.current;
    zipReaderRef.current = null;

    try {
      await currentReader.close();
    } catch {
      // Ignore close errors from partially read archives.
    }
  }

  function resetDatasetState(nextRows) {
    setDatasetMode(false);
    setDatasetFileName('');
    setDatasetMetadata(null);
    zipEntryMapRef.current.clear();
    zipSuffixCacheRef.current.clear();
    clearDatasetAssetUrls();
    setSelectedRowId('');
    setAllRows(Array.isArray(nextRows) ? nextRows : defaultRows);
  }

  async function loadDatasetFromZip(file) {
    if (!file) {
      return;
    }

    setDatasetLoading(true);
    setDatasetError('');

    try {
      await closeCurrentReader();
      clearDatasetAssetUrls();
      zipEntryMapRef.current.clear();
      zipSuffixCacheRef.current.clear();

      const nextReader = new ZipReader(new BlobReader(file));
      const entries = await nextReader.getEntries();

      const fileEntries = entries.filter((entry) => !entry.directory);
      const entryMap = new Map(fileEntries.map((entry) => [normalizeZipPath(entry.filename), entry]));

      const metadataEntry = fileEntries.find((entry) => {
        const filename = normalizeZipPath(entry.filename).toLowerCase();
        return filename === 'metadata.json' || filename.endsWith('/metadata.json');
      });

      const indexEntry = fileEntries.find((entry) => {
        const filename = normalizeZipPath(entry.filename).toLowerCase();
        return filename === 'index.json' || filename.endsWith('/index.json');
      });

      if (!indexEntry) {
        throw new Error('Dataset zip is missing index.json');
      }

      const indexText = await indexEntry.getData(new TextWriter());
      const indexRows = JSON.parse(indexText);

      if (!Array.isArray(indexRows)) {
        throw new Error('index.json must contain a JSON array of rows');
      }

      let metadataPayload = {};
      if (metadataEntry) {
        try {
          const metadataText = await metadataEntry.getData(new TextWriter());
          const parsedMetadata = JSON.parse(metadataText);
          metadataPayload = parsedMetadata && typeof parsedMetadata === 'object' ? parsedMetadata : {};
        } catch {
          metadataPayload = {};
        }
      }

      zipReaderRef.current = nextReader;
      zipEntryMapRef.current = entryMap;
      zipSuffixCacheRef.current.clear();

      setDatasetMode(true);
      setDatasetFileName(file.name || 'dataset.zip');
      setDatasetMetadata(metadataPayload);
      setSelectedRowId('');
      setAllRows(indexRows);
      setDatasetError('');
    } catch (loadError) {
      await closeCurrentReader();
      zipEntryMapRef.current.clear();
      zipSuffixCacheRef.current.clear();
      clearDatasetAssetUrls();
      setDatasetMode(false);
      setDatasetFileName('');
      setDatasetMetadata(null);
      setAllRows(defaultRows);
      setDatasetError(loadError.message || 'Failed to load dataset zip.');
    } finally {
      setDatasetLoading(false);
    }
  }

  function resolveDatasetEntry(pathValue) {
    const normalized = normalizeZipPath(pathValue);
    if (!normalized) {
      return null;
    }

    if (zipEntryMapRef.current.has(normalized)) {
      return zipEntryMapRef.current.get(normalized);
    }

    if (zipSuffixCacheRef.current.has(normalized)) {
      return zipSuffixCacheRef.current.get(normalized);
    }

    const suffix = `/${normalized}`;

    for (const [entryPath, entry] of zipEntryMapRef.current.entries()) {
      if (entryPath.endsWith(suffix)) {
        zipSuffixCacheRef.current.set(normalized, entry);
        return entry;
      }
    }

    zipSuffixCacheRef.current.set(normalized, null);
    return null;
  }

  async function ensureDatasetAssetUrl(pathValue) {
    const normalized = normalizeZipPath(pathValue);
    if (!normalized) {
      return '';
    }

    if (datasetAssetUrlMapRef.current.has(normalized)) {
      return datasetAssetUrlMapRef.current.get(normalized);
    }

    if (pendingAssetLoadsRef.current.has(normalized)) {
      return pendingAssetLoadsRef.current.get(normalized);
    }

    const loadPromise = (async () => {
      const entry = resolveDatasetEntry(normalized);
      if (!entry) {
        return '';
      }

      const blob = await entry.getData(new BlobWriter());
      const blobUrl = URL.createObjectURL(blob);
      datasetAssetUrlMapRef.current.set(normalized, blobUrl);
      setDatasetAssetUrls((previous) => {
        if (previous[normalized]) {
          return previous;
        }

        return {
          ...previous,
          [normalized]: blobUrl,
        };
      });

      return blobUrl;
    })()
      .catch(() => '')
      .finally(() => {
        pendingAssetLoadsRef.current.delete(normalized);
      });

    pendingAssetLoadsRef.current.set(normalized, loadPromise);
    return loadPromise;
  }

  useEffect(() => {
    let ignore = false;

    async function loadCoreData() {
      try {
        setSubjectCatalogLoading(true);
        setLoading(true);

        const [subjectTaxonomyResponse, rowsResponse] = await Promise.all([
          fetch(withBasePath('/config/subject_taxonomy.json')),
          fetch(withBasePath('/data.json')),
        ]);

        if (!subjectTaxonomyResponse.ok) {
          throw new Error('Missing or unreadable /config/subject_taxonomy.json');
        }

        if (!rowsResponse.ok) {
          throw new Error('Missing or unreadable /data.json');
        }

        const subjectTaxonomyPayload = await subjectTaxonomyResponse.json();
        const subjectList = Array.isArray(subjectTaxonomyPayload)
          ? subjectTaxonomyPayload
          : subjectTaxonomyPayload.subjects;

        const normalizedSubjects = (Array.isArray(subjectList) ? subjectList : [])
          .map(normalizeSubjectTaxonomy)
          .filter(Boolean);

        if (normalizedSubjects.length === 0) {
          throw new Error('No subjects found in /config/subject_taxonomy.json');
        }

        const loadedRows = await rowsResponse.json();
        const normalizedRows = Array.isArray(loadedRows) ? loadedRows : [];

        if (!ignore) {
          setSubjects(normalizedSubjects);
          setDefaultRows(normalizedRows);
          if (!datasetMode) {
            setAllRows(normalizedRows);
          }
          setError('');
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || 'Failed to load data.');
        }
      } finally {
        if (!ignore) {
          setSubjectCatalogLoading(false);
          setLoading(false);
        }
      }
    }

    loadCoreData();

    return () => {
      ignore = true;
    };
  }, [datasetMode]);

  useEffect(() => {
    return () => {
      clearDatasetAssetUrls();
      void closeCurrentReader();
    };
  }, []);

  const tokenToCanonical = useMemo(() => {
    const map = {};

    for (const subject of subjects) {
      map[subject.token] = subject.token;
      for (const alias of subject.aliases) {
        map[alias] = subject.token;
      }
    }

    return map;
  }, [subjects]);

  const rowsBySubject = useMemo(() => {
    const grouped = {};

    for (const subject of subjects) {
      grouped[subject.token] = [];
    }

    for (const row of allRows) {
      const subjectToken = resolveRowSubjectToken(row, tokenToCanonical);

      if (subjectToken && grouped[subjectToken]) {
        grouped[subjectToken].push(row);
      }
    }

    return grouped;
  }, [allRows, subjects, tokenToCanonical]);

  const selectedSubject = useMemo(() => {
    return subjects.find((subject) => subject.token === selectedSubjectToken) || null;
  }, [subjects, selectedSubjectToken]);

  const { aosById, topicById } = useMemo(() => {
    return buildTaxonomyMaps(selectedSubject);
  }, [selectedSubject]);

  useEffect(() => {
    setSelectedRowId('');
    setSearch('');
    setSourceFilter('all');
    setYearFilter('all');
    setSectionFilter('all');
    setAosFilter('all');
    setTopicFilter('all');
  }, [selectedSubjectToken]);

  const subjectRows = useMemo(() => {
    if (!selectedSubject) {
      return [];
    }

    return rowsBySubject[selectedSubject.token] || [];
  }, [selectedSubject, rowsBySubject]);

  const sortedRows = useMemo(() => {
    return [...subjectRows].sort(compareRows);
  }, [subjectRows]);

  const listRows = useMemo(() => {
    return sortedRows.filter((row) => normalizeSubquestion(row.subquestion) !== 'intro');
  }, [sortedRows]);

  const selectedRow = useMemo(() => {
    return sortedRows.find((row) => row.id === selectedRowId) || null;
  }, [sortedRows, selectedRowId]);

  const showRows = useMemo(() => {
    return getShowRows(selectedRow, sortedRows);
  }, [selectedRow, sortedRows]);

  useEffect(() => {
    if (!datasetMode || !showImagesMode || !selectedRow || showRows.length === 0) {
      return;
    }

    let canceled = false;

    async function preloadVisibleImages() {
      for (const row of showRows) {
        if (canceled) {
          return;
        }

        await ensureDatasetAssetUrl(row.image);
      }
    }

    void preloadVisibleImages();

    return () => {
      canceled = true;
    };
  }, [datasetMode, showImagesMode, selectedRow, showRows]);

  const sources = useMemo(() => uniqueSortedValues(listRows, 'source'), [listRows]);
  const years = useMemo(() => uniqueSortedValues(listRows, 'year'), [listRows]);
  const sections = useMemo(() => uniqueSortedValues(listRows, 'section'), [listRows]);
  const aosOptions = useMemo(() => {
    return uniqueSortedValues(listRows, 'aos_id').map((id) => ({
      id,
      name: aosById[id]?.name || 'Unknown',
      shortLabel: formatAosLabel(id),
    }));
  }, [listRows, aosById]);

  const topicOptions = useMemo(() => {
    return uniqueSortedValues(listRows, 'topic_id').map((id) => ({
      id,
      name: topicById[id]?.name || 'Unknown',
    }));
  }, [listRows, topicById]);

  const filteredRows = useMemo(() => {
    const loweredSearch = search.trim().toLowerCase();

    return listRows.filter((row) => {
      if (sourceFilter !== 'all' && row.source !== sourceFilter) {
        return false;
      }

      if (yearFilter !== 'all' && String(row.year) !== yearFilter) {
        return false;
      }

      if (sectionFilter !== 'all' && row.section !== sectionFilter) {
        return false;
      }

      if (aosFilter !== 'all' && row.aos_id !== aosFilter) {
        return false;
      }

      if (topicFilter !== 'all' && row.topic_id !== topicFilter) {
        return false;
      }

      if (!loweredSearch) {
        return true;
      }

      const aosName = aosById[row.aos_id]?.name || '';
      const topicName = topicById[row.topic_id]?.name || '';

      const searchable = [
        row.id,
        row.source,
        row.year,
        row.section,
        row.question_label,
        row.aos_id,
        row.topic_id,
        aosName,
        topicName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(loweredSearch);
    });
  }, [
    listRows,
    search,
    sourceFilter,
    yearFilter,
    sectionFilter,
    aosFilter,
    topicFilter,
    aosById,
    topicById,
  ]);
  const majorQuestionRows = useMemo(() => {
    const seen = new Set();
    const majors = [];

    for (const row of filteredRows) {
      const key = getMajorQuestionKey(row);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      majors.push(row);
    }

    return majors;
  }, [filteredRows]);

  const currentMajorIndex = useMemo(() => {
    if (!selectedRow) {
      return -1;
    }

    const selectedKey = getMajorQuestionKey(selectedRow);
    return majorQuestionRows.findIndex((row) => getMajorQuestionKey(row) === selectedKey);
  }, [majorQuestionRows, selectedRow]);

  const groupedSubjects = useMemo(() => {
    const groups = {};

    for (const subject of subjects) {
      const groupName = String(subject.group || 'Other');
      if (!groups[groupName]) {
        groups[groupName] = [];
      }

      groups[groupName].push(subject);
    }

    return Object.entries(groups)
      .map(([groupName, groupSubjects]) => ({
        groupName,
        subjects: [...groupSubjects].sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.groupName.localeCompare(right.groupName));
  }, [subjects]);

  function openQuestionLink(url) {
    if (!url) {
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function getRowImageSrc(imagePath) {
    if (!datasetMode) {
      return toPublicPath(imagePath);
    }

    return datasetAssetUrls[normalizeZipPath(imagePath)] || '';
  }

  function handleRowActivate(row) {
    if (showImagesMode) {
      setSelectedRowId(row.id);
      return;
    }

    openQuestionLink(row.exam_url);
  }

  function handleOpenDatasetClick() {
    fileInputRef.current?.click();
  }

  async function handleDatasetFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    await loadDatasetFromZip(file);
  }

  async function handleUseBuiltInIndex() {
    await closeCurrentReader();
    resetDatasetState(defaultRows);
    setDatasetError('');
  }

  function renderDatasetControls() {
    return (
      <div className="dataset-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          className="file-input-hidden"
          onChange={(event) => {
            void handleDatasetFileChange(event);
          }}
        />

        <button
          type="button"
          className="back-button subject-switch-button"
          onClick={handleOpenDatasetClick}
          disabled={datasetLoading}
        >
          {datasetLoading ? 'Loading dataset...' : 'Open dataset (.zip)'}
        </button>

        {datasetMode ? (
          <button
            type="button"
            className="back-button subject-switch-button"
            onClick={() => {
              void handleUseBuiltInIndex();
            }}
            disabled={datasetLoading}
          >
            Use built-in index
          </button>
        ) : null}
      </div>
    );
  }

  function goToRelativeMajorQuestion(offset) {
    if (currentMajorIndex < 0) {
      return;
    }

    const nextIndex = currentMajorIndex + offset;
    if (nextIndex < 0 || nextIndex >= majorQuestionRows.length) {
      return;
    }

    setSelectedRowId(majorQuestionRows[nextIndex].id);
  }

  if (subjectCatalogLoading || loading) {
    return <main className="app-shell">Loading subjects...</main>;
  }

  if (error) {
    return <main className="app-shell error">{error}</main>;
  }

  if (!selectedSubject) {
    return (
      <main className="app-shell home-shell">
        <header className="page-header subject-header">
          <div className="header-copy">
            <p className="eyebrow">VCE Database</p>
            <h1>Select Subject</h1>
            {datasetMode ? (
              <p className="summary dataset-summary">
                Dataset: <strong>{datasetTitle}</strong>
                {datasetDescription ? ` | ${datasetDescription}` : ''}
              </p>
            ) : null}
            {datasetError ? <p className="summary dataset-error">{datasetError}</p> : null}
          </div>
          <div className="header-actions subject-actions">
            {renderDatasetControls()}
          </div>
        </header>

        {groupedSubjects.map((group) => (
          <section key={group.groupName} className="subject-group" aria-label={`${group.groupName} subjects`}>
            <h2>{group.groupName}</h2>
            <div className="subject-grid">
              {group.subjects.map((subject) => (
                <button
                  key={subject.token}
                  type="button"
                  className="subject-card"
                  onClick={() => setSelectedSubjectToken(subject.token)}
                >
                  <h3>{subject.name}</h3>
                </button>
              ))}
            </div>
          </section>
        ))}

        <footer className="bottom-bar">
          Contact Zach for issues or feature requests.
        </footer>
      </main>
    );
  }

  if (showImagesMode && selectedRow) {
    const subquestion = normalizeSubquestion(selectedRow.subquestion);
    const subquestionLabel = subquestion ? `Subquestion ${subquestion}` : 'Main question';
    const sectionBSelected = isSectionB(selectedRow.section);
    const metadataRows = sectionBSelected
      ? showRows.filter((row) => normalizeSubquestion(row.subquestion) !== 'intro')
      : showRows;
    const detailAosNames = Array.from(new Set(metadataRows.map((row) => aosById[row.aos_id]?.name || 'Unknown')));
    const detailTopicNames = Array.from(new Set(metadataRows.map((row) => topicById[row.topic_id]?.name || 'Unknown')));
    const pageStarts = showRows.map((row) => Number(row.start_page)).filter((value) => !Number.isNaN(value));
    const pageEnds = showRows.map((row) => Number(row.end_page)).filter((value) => !Number.isNaN(value));
    const pageStart = pageStarts.length ? Math.min(...pageStarts) : '?';
    const pageEnd = pageEnds.length ? Math.max(...pageEnds) : '?';
    const isAtFirstQuestion = currentMajorIndex <= 0;
    const isAtLastQuestion = currentMajorIndex < 0 || currentMajorIndex >= majorQuestionRows.length - 1;

    return (
      <main className="app-shell">
        <header className="page-header subject-header detail-header">
          <div className="header-copy">
            <button type="button" className="detail-back-link" onClick={() => setSelectedRowId('')}>
              <span className="detail-back-icon" aria-hidden="true">
                &larr;
              </span>
              <span>Back to {selectedSubject.name.toUpperCase()}</span>
            </button>
            <h1>{selectedRow.question_label || selectedRow.id}</h1>
            <p className="summary">
              {selectedRow.source} {selectedRow.year} | {selectedRow.section} | Q{selectedRow.question_number} | {subquestionLabel}
            </p>
          </div>
          <div className="header-actions subject-actions">
            <button
              type="button"
              className="back-button subject-switch-button"
              onClick={() => setSelectedSubjectToken('')}
            >
              Change subject
            </button>
            {renderDatasetControls()}
          </div>
        </header>

        <section className="detail-meta">
          <p>
            <strong>Topic:</strong> {detailTopicNames.join(', ')}
          </p>
          <p>
            <strong>AOS:</strong> {detailAosNames.join(', ')}
          </p>
          <p>
            <strong>Pages:</strong> {pageStart} - {pageEnd}
          </p>
          <p>
            <a href={selectedRow.exam_url} target="_blank" rel="noreferrer">Exam file</a>
            {' | '}
            <a href={selectedRow.assessor_url} target="_blank" rel="noreferrer">Assessor report</a>
          </p>
        </section>

        <section className="question-nav" aria-label="question navigation">
          <button
            type="button"
            className="back-button subject-switch-button"
            onClick={() => goToRelativeMajorQuestion(-1)}
            disabled={isAtFirstQuestion}
          >
            &larr; Previous
          </button>
          <button
            type="button"
            className="back-button subject-switch-button"
            onClick={() => goToRelativeMajorQuestion(1)}
            disabled={isAtLastQuestion}
          >
            Next &rarr;
          </button>
        </section>

        <section className={`image-grid${sectionBSelected ? ' continuous' : ''}`} aria-label="question images">
          {showRows.map((row) => {
            const rowSubquestion = normalizeSubquestion(row.subquestion);
            const rowSubquestionLabel = rowSubquestion ? `Subquestion ${rowSubquestion}` : 'Main question';
            const isClicked = row.id === selectedRowId;
            const imageSrc = getRowImageSrc(row.image);

            return (
              <figure key={row.id} className={`image-card${isClicked ? ' selected' : ''}${sectionBSelected ? ' continuous' : ''}`}>
                {sectionBSelected ? (
                  isClicked ? <span className="selected-pill floating">Selected part</span> : null
                ) : (
                  <figcaption>
                    {row.question_label || row.id} | {rowSubquestionLabel}
                    {isClicked ? <span className="selected-pill">Selected</span> : null}
                  </figcaption>
                )}
                {imageSrc ? (
                  <img src={imageSrc} alt={row.question_label || row.id} loading="lazy" />
                ) : (
                  <div className="image-placeholder">Loading image...</div>
                )}
              </figure>
            );
          })}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="page-header subject-header">
        <div className="header-copy">
          <button type="button" className="detail-back-link" onClick={() => setSelectedSubjectToken('')}>
            <span className="detail-back-icon" aria-hidden="true">
              &larr;
            </span>
            <span>Back to Subject Selection</span>
          </button>
          <h1>{selectedSubject.name}</h1>
          <p className="summary">{filteredRows.length} of {listRows.length} questions shown</p>
          {datasetMode ? (
            <p className="summary dataset-summary">
              Dataset: <strong>{datasetTitle}</strong>
              {datasetDescription ? ` | ${datasetDescription}` : ''}
            </p>
          ) : null}
          {datasetError ? <p className="summary dataset-error">{datasetError}</p> : null}
        </div>
        <div className="header-actions subject-actions">
          <button type="button" className="back-button subject-switch-button" onClick={() => setSelectedSubjectToken('')}>
            Change subject
          </button>
          {renderDatasetControls()}
        </div>
      </header>

      <section className="controls" aria-label="search and filters">
        <label>
          Search
          <input
            type="search"
            placeholder="Search by ID, section, label, AOS, topic..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label>
          Source
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="all">All sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>

        <label>
          Year
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="all">All years</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label>
          Section
          <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
            <option value="all">All sections</option>
            {sections.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </label>

        <label>
          Area of Study
          <select value={aosFilter} onChange={(event) => setAosFilter(event.target.value)}>
            <option value="all">All Areas of Study</option>
            {aosOptions.map((aos) => (
              <option key={aos.id} value={aos.id}>
                {aos.shortLabel} - {aos.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Topic
          <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
            <option value="all">All topics</option>
            {topicOptions.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="results" aria-label="questions list">
        {filteredRows.length === 0 ? (
          <p className="empty-state">No questions match the current search and filters.</p>
        ) : (
          <>
            <div className="table-head" aria-hidden="true">
              <span>Topic / AOS</span>
              <span>Source</span>
              <span>Year</span>
              <span>Section</span>
              <span>Q</span>
              <span>Links</span>
            </div>
            <div className="table-shell">
              <ul>
                {filteredRows.map((row) => (
                  <li key={row.id}>
                    <div
                      className="question-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleRowActivate(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleRowActivate(row);
                        }
                      }}
                      aria-label={`${row.question_label || row.id} question link`}
                    >
                      <span className="cell chip-cell">
                        <span className="chip chip-topic">{topicById[row.topic_id]?.name || 'Unknown'}</span>
                        <span className="chip chip-aos">{formatAosLabel(row.aos_id)}</span>
                      </span>
                      <span className="cell">{row.source}</span>
                      <span className="cell">{row.year}</span>
                      <span className="cell">{row.section}</span>
                      <span className="cell label soft">{row.question_label || row.id}</span>
                      <span className="cell row-links" onClick={(event) => event.stopPropagation()}>
                        <a
                          className="row-link-btn"
                          href={row.exam_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Question
                        </a>
                        <a
                          className="row-link-btn"
                          href={row.assessor_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          AR
                        </a>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
