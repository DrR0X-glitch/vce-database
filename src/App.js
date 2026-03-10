import { useEffect, useMemo, useState } from 'react';

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

function App() {
  const [subjects, setSubjects] = useState([]);
  const [subjectCatalogLoading, setSubjectCatalogLoading] = useState(true);
  const [selectedSubjectToken, setSelectedSubjectToken] = useState('');

  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedRowId, setSelectedRowId] = useState('');

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [aosFilter, setAosFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');

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

        if (!ignore) {
          setSubjects(normalizedSubjects);
          setAllRows(Array.isArray(loadedRows) ? loadedRows : []);
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

  if (subjectCatalogLoading || loading) {
    return <main className="app-shell">Loading subjects...</main>;
  }

  if (error) {
    return <main className="app-shell error">{error}</main>;
  }

  if (!selectedSubject) {
    return (
      <main className="app-shell home-shell">
        <header className="page-header">
          <p className="eyebrow">VCE Database</p>
          <h1>Select Subject</h1>
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

  if (SHOW_IMAGES_BETA && selectedRow) {
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

    return (
      <main className="app-shell">
        <header className="page-header detail-header">
          <div className="header-actions">
            <button type="button" className="back-button" onClick={() => setSelectedRowId('')}>
              Back to questions
            </button>
            <button type="button" className="back-button" onClick={() => setSelectedSubjectToken('')}>
              Change subject
            </button>
          </div>
          <p className="eyebrow">{selectedSubject.name}</p>
          <h1>{selectedRow.question_label || selectedRow.id}</h1>
          <p className="summary">
            {selectedRow.source} {selectedRow.year} | {selectedRow.section} | Q{selectedRow.question_number} | {subquestionLabel}
          </p>
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

        <section className={`image-grid${sectionBSelected ? ' continuous' : ''}`} aria-label="question images">
          {showRows.map((row) => {
            const rowSubquestion = normalizeSubquestion(row.subquestion);
            const rowSubquestionLabel = rowSubquestion ? `Subquestion ${rowSubquestion}` : 'Main question';
            const isClicked = row.id === selectedRowId;

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
                <img src={toPublicPath(row.image)} alt={row.question_label || row.id} loading="lazy" />
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
          <p className="eyebrow">Exam Questions</p>
          <h1>{selectedSubject.name}</h1>
          <p className="summary">{filteredRows.length} of {listRows.length} questions shown</p>
        </div>
        <div className="header-actions subject-actions">
          <button type="button" className="back-button subject-switch-button" onClick={() => setSelectedSubjectToken('')}>
            Change subject
          </button>
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
                      onClick={() => openQuestionLink(row.exam_url)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openQuestionLink(row.exam_url);
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
