/**
 * Curated ingredient names and aliases (source: saltsaver_curated).
 *
 * The display name is the one used on Indian labels; aliases cover INN / US
 * (USAN) names, old British spellings, abbreviations and salt-form spellings.
 * Only naming equivalences go here. This list says nothing about whether two
 * products are interchangeable: that is the matching engine's job.
 *
 * Alias tuple: [alias, type, saltForm?]
 *   type: 'inn' | 'indian' | 'usan' | 'abbreviation' | 'salt_form' | 'spelling' | 'other'
 *
 * Ingredients that are not listed still work: the importers create them as
 * needs_review and report them, so this list can grow from real import reports.
 */
export const CURATED_INGREDIENTS = [
  // Pain, fever, inflammation
  { name: 'Paracetamol', aliases: [['acetaminophen', 'usan'], ['pcm', 'abbreviation'], ['apap', 'abbreviation']] },
  { name: 'Ibuprofen', aliases: [] },
  { name: 'Diclofenac', aliases: [] },
  { name: 'Aceclofenac', aliases: [] },
  { name: 'Aspirin', aliases: [['acetylsalicylic acid', 'inn'], ['asa', 'abbreviation']] },

  // Diabetes
  { name: 'Metformin', aliases: [['metformin hcl', 'salt_form', 'hydrochloride'], ['metformin hydrochloride', 'salt_form', 'hydrochloride']] },
  { name: 'Glimepiride', aliases: [] },
  { name: 'Gliclazide', aliases: [] },
  { name: 'Glibenclamide', aliases: [['glyburide', 'usan']] },
  { name: 'Sitagliptin', aliases: [] },
  { name: 'Vildagliptin', aliases: [] },
  { name: 'Teneligliptin', aliases: [] },
  { name: 'Voglibose', aliases: [] },
  { name: 'Pioglitazone', aliases: [] },

  // Heart and blood pressure
  { name: 'Amlodipine', aliases: [] },
  { name: 'Telmisartan', aliases: [] },
  { name: 'Losartan', aliases: [] },
  { name: 'Olmesartan', aliases: [['olmesartan medoxomil', 'salt_form', 'medoxomil']] },
  { name: 'Hydrochlorothiazide', aliases: [['hctz', 'abbreviation']] },
  { name: 'Chlorthalidone', aliases: [['chlortalidone', 'inn']] },
  { name: 'Metoprolol', aliases: [] },
  { name: 'Atenolol', aliases: [] },
  { name: 'Bisoprolol', aliases: [] },
  { name: 'Nebivolol', aliases: [] },
  { name: 'Ramipril', aliases: [] },
  { name: 'Enalapril', aliases: [] },
  { name: 'Furosemide', aliases: [['frusemide', 'indian']] },
  { name: 'Spironolactone', aliases: [] },
  { name: 'Atorvastatin', aliases: [] },
  { name: 'Rosuvastatin', aliases: [] },
  { name: 'Clopidogrel', aliases: [] },
  { name: 'Glyceryl Trinitrate', aliases: [['nitroglycerin', 'usan'], ['gtn', 'abbreviation']] },
  { name: 'Adrenaline', aliases: [['epinephrine', 'inn']] },
  { name: 'Noradrenaline', aliases: [['norepinephrine', 'inn']] },

  // Thyroid
  { name: 'Levothyroxine', aliases: [['thyroxine', 'indian'], ['l thyroxine', 'spelling']] },

  // Stomach
  { name: 'Pantoprazole', aliases: [] },
  { name: 'Omeprazole', aliases: [] },
  { name: 'Esomeprazole', aliases: [] },
  { name: 'Rabeprazole', aliases: [] },
  { name: 'Ranitidine', aliases: [] },
  { name: 'Famotidine', aliases: [] },
  { name: 'Domperidone', aliases: [] },
  { name: 'Ondansetron', aliases: [] },
  { name: 'Dicyclomine', aliases: [['dicycloverine', 'inn']] },
  { name: 'Mesalazine', aliases: [['mesalamine', 'usan'], ['5-aminosalicylic acid', 'other'], ['5-asa', 'abbreviation']] },
  { name: 'Fluorouracil', aliases: [['5-fluorouracil', 'other'], ['5-fu', 'abbreviation']] },
  { name: 'Mercaptopurine', aliases: [['6-mercaptopurine', 'other'], ['6-mp', 'abbreviation']] },

  // Infections
  { name: 'Amoxycillin', aliases: [['amoxicillin', 'inn']] },
  {
    name: 'Clavulanic Acid',
    aliases: [
      ['potassium clavulanate', 'salt_form', 'potassium'],
      ['clavulanate potassium', 'salt_form', 'potassium'],
      ['potassium clavulanate diluted', 'salt_form', 'potassium'],
      ['clavulanate', 'other'],
    ],
  },
  { name: 'Azithromycin', aliases: [] },
  { name: 'Ciprofloxacin', aliases: [] },
  { name: 'Ofloxacin', aliases: [] },
  { name: 'Levofloxacin', aliases: [] },
  { name: 'Cefixime', aliases: [] },
  { name: 'Cefuroxime', aliases: [] },
  { name: 'Ceftriaxone', aliases: [] },
  { name: 'Cefpodoxime', aliases: [] },
  { name: 'Cephalexin', aliases: [['cefalexin', 'inn']] },
  { name: 'Doxycycline', aliases: [] },
  { name: 'Metronidazole', aliases: [] },
  { name: 'Rifampicin', aliases: [['rifampin', 'usan']] },
  { name: 'Isoniazid', aliases: [] },
  { name: 'Sulphamethoxazole', aliases: [['sulfamethoxazole', 'inn']] },
  { name: 'Trimethoprim', aliases: [] },
  { name: 'Albendazole', aliases: [] },
  { name: 'Ivermectin', aliases: [] },
  { name: 'Fluconazole', aliases: [] },
  { name: 'Clotrimazole', aliases: [] },

  // Allergy and breathing
  { name: 'Cetirizine', aliases: [] },
  { name: 'Levocetirizine', aliases: [] },
  { name: 'Fexofenadine', aliases: [] },
  { name: 'Chlorpheniramine', aliases: [['chlorphenamine', 'inn']] },
  { name: 'Montelukast', aliases: [] },
  { name: 'Salbutamol', aliases: [['albuterol', 'usan']] },
  { name: 'Budesonide', aliases: [] },
  { name: 'Formoterol', aliases: [['eformoterol', 'spelling']] },
  { name: 'Ipratropium', aliases: [] },
  { name: 'Prednisolone', aliases: [] },
  { name: 'Dexamethasone', aliases: [] },

  // Local anaesthetic
  { name: 'Lignocaine', aliases: [['lidocaine', 'inn']] },

  // Vitamins and minerals
  { name: 'Calcium Carbonate', aliases: [] },
  { name: 'Cholecalciferol', aliases: [['vitamin d3', 'other'], ['vit d3', 'abbreviation']] },
  { name: 'Ascorbic Acid', aliases: [['vitamin c', 'other'], ['vit c', 'abbreviation']] },
  { name: 'Cyanocobalamin', aliases: [['vitamin b12', 'other'], ['vit b12', 'abbreviation']] },
  { name: 'Methylcobalamin', aliases: [['mecobalamin', 'inn']] },
  { name: 'Pyridoxine', aliases: [['vitamin b6', 'other']] },
  { name: 'Folic Acid', aliases: [] },
  { name: 'Ferrous Sulphate', aliases: [['ferrous sulfate', 'spelling']] },
  { name: 'Sodium Chloride', aliases: [] },
  { name: 'Potassium Chloride', aliases: [] },
];
