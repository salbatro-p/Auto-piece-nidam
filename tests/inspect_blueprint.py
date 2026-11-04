"""Read-only source evidence for the supplied reference workbook."""
import hashlib, json, pathlib
import openpyxl
root=pathlib.Path(__file__).resolve().parents[1]
path=root/'blueprint'/'AutoParts_Work_Handoff_v1.2'/'07_REFERENCE_AutoParts_Morocco_Data_Foundation_v0_1.xlsx'
book=openpyxl.load_workbook(path,read_only=True,data_only=False)
sheets=[]
for sheet in book:
    rows=[list(row) for row in sheet.iter_rows(values_only=True) if any(v is not None for v in row)]
    sheets.append({'sheet':sheet.title,'nonemptyRows':len(rows),'dataRowsExcludingFirst':max(0,len(rows)-1),'header':rows[0] if rows else [],'sample':rows[1:3]})
result={'inspection':'read only; no workbook changes','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sheets':sheets}
output=root/'docs'/'evidence'/'blueprint-workbook.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(result,indent=2,ensure_ascii=False,default=str),encoding='utf8')
print(json.dumps({'sha256':result['sha256'],'sheets':[{'sheet':s['sheet'],'dataRowsExcludingFirst':s['dataRowsExcludingFirst']}for s in sheets]},ensure_ascii=True))
