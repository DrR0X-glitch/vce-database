import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

const mockSubjectTaxonomy = {
  subjects: [
    {
      name: 'Chemistry',
      token: 'CHEMISTRY',
      group: 'Science',
      aliases: ['chem'],
      taxonomy: {
        aos: [
          { id: '3.1', name: 'Energy Production and Electrochemistry' },
          { id: '4.1', name: 'Structure, Synthesis and Sustainability of Organic Compounds' },
        ],
        topics: [
          { id: 'FUELS_AND_THERMOCHEM', name: 'Fuels and Thermochemistry' },
          { id: 'GREEN_CHEMISTRY_AND_SUSTAINABILITY', name: 'Green Chemistry in Organic Production' },
        ],
      },
    },
    {
      name: 'Biology',
      token: 'BIOLOGY',
      group: 'Science',
      aliases: ['bio'],
      taxonomy: {
        aos: [{ id: '3.1', name: 'Nucleic Acids, Proteins and DNA Manipulation' }],
        topics: [{ id: 'DNA_RNA_AND_GENETIC_CODE', name: 'DNA, RNA and the Genetic Code' }],
      },
    },
  ],
};

const mockRows = [
  {
    id: 'VCAA_CHEMISTRY_2025__section_a__q1',
    source: 'VCAA',
    year: '2025',
    section: 'Section A',
    question_number: 1,
    subquestion: null,
    question_label: 'Q1',
    image: 'data/VCAA_CHEMISTRY_2025/images/section_a_Q1.png',
    exam_url: 'https://example.com/exam.pdf',
    assessor_url: 'https://example.com/report.pdf',
    exam_folder: 'VCAA_CHEMISTRY_2025',
    start_page: 2,
    end_page: 2,
    aos_id: '3.1',
    topic_id: 'FUELS_AND_THERMOCHEM',
  },
  {
    id: 'VCAA_CHEMISTRY_2025__section_b__q10_intro',
    source: 'VCAA',
    year: '2025',
    section: 'Section B',
    question_number: 10,
    subquestion: 'intro',
    question_label: 'Q10 intro',
    image: 'data/VCAA_CHEMISTRY_2025/images/section_b_Q10_intro.png',
    exam_url: 'https://example.com/exam.pdf',
    assessor_url: 'https://example.com/report.pdf',
    exam_folder: 'VCAA_CHEMISTRY_2025',
    start_page: 12,
    end_page: 12,
    aos_id: null,
    topic_id: null,
  },
  {
    id: 'VCAA_CHEMISTRY_2025__section_b__q10_a',
    source: 'VCAA',
    year: '2025',
    section: 'Section B',
    question_number: 10,
    subquestion: 'a',
    question_label: 'Q10a',
    image: 'data/VCAA_CHEMISTRY_2025/images/section_b_Q10a.png',
    exam_url: 'https://example.com/exam.pdf',
    assessor_url: 'https://example.com/report.pdf',
    exam_folder: 'VCAA_CHEMISTRY_2025',
    start_page: 12,
    end_page: 12,
    aos_id: '3.1',
    topic_id: 'FUELS_AND_THERMOCHEM',
  },
  {
    id: 'VCAA_CHEMISTRY_2025__section_b__q10_b',
    source: 'VCAA',
    year: '2025',
    section: 'Section B',
    question_number: 10,
    subquestion: 'b',
    question_label: 'Q10b',
    image: 'data/VCAA_CHEMISTRY_2025/images/section_b_Q10b.png',
    exam_url: 'https://example.com/exam.pdf',
    assessor_url: 'https://example.com/report.pdf',
    exam_folder: 'VCAA_CHEMISTRY_2025',
    start_page: 12,
    end_page: 13,
    aos_id: '4.1',
    topic_id: 'GREEN_CHEMISTRY_AND_SUSTAINABILITY',
  },
  {
    id: 'VCAA_BIOLOGY_2025__section_a__q1',
    source: 'VCAA',
    year: '2025',
    section: 'Section A',
    question_number: 1,
    subquestion: null,
    question_label: 'Q1',
    image: 'data/VCAA_BIOLOGY_2025/images/section_a_Q1.png',
    exam_url: 'https://example.com/bio-exam.pdf',
    assessor_url: 'https://example.com/bio-report.pdf',
    exam_folder: 'VCAA_BIOLOGY_2025',
    start_page: 2,
    end_page: 2,
    aos_id: '3.1',
    topic_id: 'DNA_RNA_AND_GENETIC_CODE',
  },
];

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (url === '/config/subject_taxonomy.json') {
      return Promise.resolve({ ok: true, json: async () => mockSubjectTaxonomy });
    }

    if (url === '/data.json') {
      return Promise.resolve({ ok: true, json: async () => mockRows });
    }

    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function openChemistrySubject() {
  const chemistryButton = await screen.findByRole('button', { name: /chemistry/i });
  fireEvent.click(chemistryButton);
}

test('renders subject home from subject taxonomy then chemistry list', async () => {
  render(<App />);

  expect(await screen.findByRole('heading', { name: /select subject/i })).toBeInTheDocument();
  expect(screen.getByText(/contact zach for issues or feature requests/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /science/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /biology/i })).toBeInTheDocument();

  await openChemistrySubject();

  expect(await screen.findByRole('heading', { name: /chemistry/i })).toBeInTheDocument();
  expect(screen.getByText(/exam questions/i)).toBeInTheDocument();
  expect(screen.getByText(/3 of 3 questions shown/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Q10 intro/i })).not.toBeInTheDocument();
  expect(screen.getAllByText(/Fuels and Thermochemistry/i).length).toBeGreaterThan(0);
});

test('opens exam url by default and provides Question and AR buttons', async () => {
  render(<App />);

  await openChemistrySubject();

  expect(screen.queryByRole('region', { name: /question images/i })).not.toBeInTheDocument();
  expect(screen.getAllByText(/U3 AOS1/i).length).toBeGreaterThan(0);

  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

  const q10bRow = await screen.findByRole('button', { name: /Q10b question link/i });
  fireEvent.click(q10bRow);
  expect(openSpy).toHaveBeenCalledWith('https://example.com/exam.pdf', '_blank', 'noopener,noreferrer');

  const questionLink = within(q10bRow).getByRole('link', { name: 'Question' });
  const arLink = within(q10bRow).getByRole('link', { name: 'AR' });

  expect(questionLink).toHaveAttribute('href', 'https://example.com/exam.pdf');
  expect(arLink).toHaveAttribute('href', 'https://example.com/report.pdf');
});
